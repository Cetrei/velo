use crate::log_messages::LogMessage;
use libloading::{Library, Symbol};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

/// Must match `crates/vcam-driver/src/ffi.rs`'s `CORE_ABI_VERSION` exactly.
/// Bumped only in lockstep with that constant, in the same change, per
/// `TODO.md` Phase 4. A shell built against one value must never call into
/// a Core `.dll` exporting a different one.
const EXPECTED_CORE_ABI_VERSION: u32 = 1;

const CORE_BINARY_FILENAME: &str = "velo_core.dll";
const CORE_BACKUP_FILENAME: &str = "velo_core.dll.backup";
// Must match config/manifest.json's "core" module entry ("data_subdir" and
// "binary_asset_name"). Kept as local constants instead of resolving the
// path through module_manager/manifest at every call site, since
// `write_frame` runs on the hot frame-push path and cannot afford an async
// manifest fetch. If the manifest entry for "core" ever changes either
// value, this constant must change in the same commit.
const CORE_DATA_SUBDIR: &str = "core";

type WriteFrameFn = unsafe extern "C" fn(*const u8, usize, u32, u32) -> i32;

struct LoadedCore {
    // Kept alive alongside `write_frame` on purpose: the function pointer
    // below only remains valid for as long as this library stays mapped
    // in the process. Never split these into separately owned values.
    _library: Library,
    write_frame: WriteFrameFn,
}

unsafe impl Send for LoadedCore {}

static ACTIVE_CORE: Mutex<Option<LoadedCore>> = Mutex::new(None);

fn resolve_core_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(CORE_DATA_SUBDIR))
        .map_err(|_| LogMessage::CoreDataDirResolveFailed.text())
}

fn resolve_core_binary_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(resolve_core_dir(app)?.join(CORE_BINARY_FILENAME))
}

fn resolve_core_backup_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(resolve_core_dir(app)?.join(CORE_BACKUP_FILENAME))
}

/// Loads the Core dylib at `path` and verifies its `CORE_ABI_VERSION`
/// symbol before resolving any other exported function. The ABI check must
/// happen first: reading a function symbol out of a library built against
/// an incompatible layout is itself unsound, so there is no safe order
/// other than version-check-then-resolve.
///
/// # Safety
/// The caller must ensure `path` points to a trustworthy dynamic library.
/// Loading and calling into an arbitrary native library is inherently
/// unsafe; the ABI version check here only guards against an
/// accidentally-mismatched Velo-Core build, not a malicious one. Manifest
/// signature verification (`manifest.rs`) is what establishes trust in
/// which binary gets placed at `path` in the first place.
unsafe fn load_core_at(path: &Path) -> Result<LoadedCore, String> {
    let library =
        unsafe { Library::new(path) }.map_err(|error| LogMessage::CoreLoadFailed(error.to_string()).text())?;

    let abi_version_symbol: Symbol<*const u32> = unsafe { library.get(b"CORE_ABI_VERSION\0") }
        .map_err(|error| LogMessage::CoreSymbolMissing(error.to_string()).text())?;
    let actual_abi_version = unsafe { **abi_version_symbol };
    if actual_abi_version != EXPECTED_CORE_ABI_VERSION {
        return Err(LogMessage::CoreAbiMismatch(EXPECTED_CORE_ABI_VERSION, actual_abi_version).text());
    }
    drop(abi_version_symbol);

    let write_frame_symbol: Symbol<WriteFrameFn> = unsafe { library.get(b"velo_core_write_frame\0") }
        .map_err(|error| LogMessage::CoreSymbolMissing(error.to_string()).text())?;
    let write_frame = *write_frame_symbol;
    drop(write_frame_symbol);

    Ok(LoadedCore { _library: library, write_frame })
}

fn try_load_backup(app: &AppHandle, primary_error: String) {
    let Ok(backup_path) = resolve_core_backup_path(app) else {
        return;
    };
    if !backup_path.exists() {
        println!("{}", LogMessage::CoreRollbackUnavailable(primary_error).text());
        return;
    }

    match unsafe { load_core_at(&backup_path) } {
        Ok(core) => {
            println!("{}", LogMessage::CoreRolledBackToBackup(primary_error).text());
            *ACTIVE_CORE.lock().unwrap() = Some(core);
        }
        Err(backup_error) => {
            println!("{}", LogMessage::CoreRollbackFailed(primary_error, backup_error).text());
        }
    }
}

/// Loads whatever Velo-Core binary is currently installed into
/// `ACTIVE_CORE`, replacing any previously loaded one. On a load failure
/// (missing symbols, an ABI mismatch after a bad update, a corrupted
/// download), falls back to `velo_core.dll.backup` instead of leaving the
/// shell with nothing loaded. The backup file itself is maintained by
/// `module_manager`'s install/replace pipeline, not by this function; this
/// function only ever reads it.
///
/// If neither the primary nor the backup binary loads, `push_frame` calls
/// will fail with `CoreNotLoaded` / the relevant load error until the next
/// successful call to this function.
pub fn load_or_rollback(app: &AppHandle) {
    let Ok(primary_path) = resolve_core_binary_path(app) else {
        println!("{}", LogMessage::CoreDataDirResolveFailed.text());
        return;
    };

    if !primary_path.exists() {
        println!("{}", LogMessage::CoreNotInstalled.text());
        return;
    }

    match unsafe { load_core_at(&primary_path) } {
        Ok(core) => {
            println!("{}", LogMessage::CoreLoaded(EXPECTED_CORE_ABI_VERSION).text());
            *ACTIVE_CORE.lock().unwrap() = Some(core);
        }
        Err(primary_error) => {
            println!("{}", LogMessage::CoreLoadFailedFallingBackToBackup(primary_error.clone()).text());
            try_load_backup(app, primary_error);
        }
    }
}

/// Drops the currently loaded Velo-Core, if any, which unmaps its `.dll`
/// from the process (`libloading::Library`'s `Drop` calls `FreeLibrary`).
/// This must run before `module_manager` attempts to overwrite or rename
/// the on-disk binary during an install/update: Windows locks a `.dll`
/// file for as long as it is mapped into a running process, so replacing
/// it while still loaded would fail exactly the way a `Process` module's
/// binary would if its child process were not killed first. This is the
/// `Dylib`-strategy equivalent of `module_manager::kill_running_module`.
pub fn unload() {
    *ACTIVE_CORE.lock().unwrap() = None;
}

/// Whether a Velo-Core is currently loaded and ready to accept
/// `write_frame` calls. Used by `module_manager` as the `Dylib`-strategy
/// equivalent of a `Process` module's health check, since there is no HTTP
/// endpoint or child process to poll for an in-process library.
pub fn is_loaded() -> bool {
    ACTIVE_CORE.lock().unwrap().is_some()
}

/// Writes one RGBA frame through the currently loaded Velo-Core, if any.
///
/// The FFI call is wrapped in `catch_unwind` per `TODO.md` Phase 4: Core is
/// the part of this codebase expected to change most often, so a panic
/// inside it must never be allowed to unwind into and take down the shell
/// process. The lock on `ACTIVE_CORE` is held for the duration of the call
/// on purpose, not just while reading the function pointer, so a concurrent
/// `load_or_rollback`/`unload` (an update landing mid-stream) cannot unmap
/// the library while a call into it is still in flight.
pub fn write_frame(bytes: &[u8], width: u32, height: u32) -> Result<(), String> {
    let guard = ACTIVE_CORE.lock().unwrap();
    let Some(core) = guard.as_ref() else {
        return Err(LogMessage::CoreNotLoaded.text());
    };

    let write_frame_fn = core.write_frame;
    let ptr = bytes.as_ptr();
    let len = bytes.len();

    let call_result = std::panic::catch_unwind(|| unsafe { write_frame_fn(ptr, len, width, height) });

    match call_result {
        Ok(0) => Ok(()),
        Ok(code) => Err(LogMessage::CoreWriteFrameFailed(code).text()),
        Err(_) => Err(LogMessage::CoreWriteFramePanicked.text()),
    }
}
