use crate::core_loader;
use crate::log_messages::LogMessage;
use crate::update_progress::{build_http_client, download_with_progress, emit_progress, request_timeout, CancellationToken, DownloadError, UpdateProgress};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Child;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager};

const GITHUB_API_ACCEPT_HEADER: &str = "application/vnd.github+json";
const GITHUB_USER_AGENT: &str = "velo-desktop-module-manager";
const CREATE_NO_WINDOW: u32 = 0x08000000;
const REPLACE_MAX_ATTEMPTS: u32 = 5;
const REPLACE_RETRY_BASE_DELAY_MS: u64 = 200;
const POST_INSTALL_HEALTHCHECK_ATTEMPTS: u32 = 10;
const POST_INSTALL_HEALTHCHECK_DELAY_MS: u64 = 300;
const UNINSTALL_MAX_ATTEMPTS: u32 = 8;
const UNINSTALL_RETRY_BASE_DELAY_MS: u64 = 250;
const UNINSTALL_INITIAL_DELAY_MS: u64 = 250;
const CANCELLED_ERROR: &str = "cancelled";

/// How a module is installed and run. `Process` spawns a standalone child
/// process (Velo-Server, cloudflared). `Dylib` loads a cdylib in-process
/// via `libloading` instead (Velo-Core, see `core_loader.rs`) - there is no
/// child process to kill or spawn, so the generic engine below branches on
/// this at every step that would otherwise assume a `Process` module.
#[derive(Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum InstallStrategy {
    Process,
    Dylib,
}

/// How to confirm a freshly installed or restarted module is actually
/// healthy, not just that its process started. `Http` polls a local
/// endpoint whose port comes from `system.yml`, mirroring what
/// `server_manager.rs` already does. `None` skips the healthcheck entirely,
/// mirroring `tunnel_manager.rs`'s current behavior for cloudflared.
#[derive(Clone, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum HealthCheckKind {
    Http { local_version_path: String },
    None,
}

/// Static description of one updatable module. Constructed once per module
/// (server, tunnel, and eventually core) and passed into the generic engine
/// functions below, replacing the module-specific logic that used to be
/// duplicated between `server_manager.rs` and `tunnel_manager.rs`.
#[derive(Clone)]
pub struct Module {
    pub id: String,
    pub strategy: InstallStrategy,
    pub binary_filename: String,
    pub release_repo: String,
    pub tag_prefix: String,
    pub health_check: HealthCheckKind,
    /// The writable data subdirectory this module's binary lives in.
    /// Kept separate from `id` so migrating an existing module onto this
    /// generic engine can keep using its pre-migration on-disk directory
    /// name (`backend`, `cloudflared`) instead of silently orphaning
    /// already-installed binaries under a new `id`-named directory and
    /// triggering an unnecessary first-run reinstall. New modules with no
    /// migration history should just set this equal to `id`.
    pub data_subdir: String,
}

impl Module {
    fn progress_event_name(&self) -> String {
        format!("{}-update-progress", self.id)
    }

    fn data_subdir_name(&self) -> &str {
        &self.data_subdir
    }
}

#[derive(Serialize)]
pub struct ModuleStatus {
    pub running: bool,
    pub installed: bool,
    pub version: Option<String>,
}

#[derive(Serialize)]
pub struct ModuleUpdateInfo {
    pub available: bool,
    pub current_version: Option<String>,
    pub latest_version: Option<String>,
}

/// Tracks the running child process and any in-flight update cancellation
/// token per module id, in one managed state instead of one Tauri-managed
/// type per module. Tauri's state store is keyed by Rust type, not by
/// value, so `.manage()`-ing a distinct `ModuleProcessState` type alias per
/// module would silently collide: only the first registration for a given
/// concrete type is ever retrieved. Keying by `module.id` inside a single
/// managed registry sidesteps that entirely, and is what actually lets the
/// generic engine track server and tunnel processes independently.
#[derive(Default)]
pub struct ModuleRegistry {
    processes: Mutex<HashMap<String, Child>>,
    cancellations: Mutex<HashMap<String, CancellationToken>>,
}

impl ModuleRegistry {
    pub fn new() -> Self {
        Self::default()
    }
}

#[derive(Deserialize)]
struct LocalVersionResponse {
    version: String,
}

#[derive(Deserialize)]
struct GithubReleaseAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Deserialize)]
struct GithubRelease {
    tag_name: String,
    draft: bool,
    prerelease: bool,
    assets: Vec<GithubReleaseAsset>,
}

pub fn resolve_module_dir(app: &AppHandle, module: &Module) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| LogMessage::ModuleDataDirResolveFailed(module.id.clone()).text())?;
    Ok(data_dir.join(module.data_subdir_name()))
}

fn resolve_writable_binary_path(app: &AppHandle, module: &Module) -> Result<PathBuf, String> {
    Ok(resolve_module_dir(app, module)?.join(&module.binary_filename))
}

fn resolve_backup_binary_path(app: &AppHandle, module: &Module) -> Result<PathBuf, String> {
    Ok(resolve_module_dir(app, module)?.join(format!("{}.backup", module.binary_filename)))
}

fn resolve_partial_download_path(app: &AppHandle, module: &Module) -> Result<PathBuf, String> {
    Ok(resolve_module_dir(app, module)?.join(format!("{}.partial", module.binary_filename)))
}

pub fn is_module_installed(app: &AppHandle, module: &Module) -> bool {
    resolve_writable_binary_path(app, module).map(|path| path.exists()).unwrap_or(false)
}

fn resolve_installed_version_file_path(app: &AppHandle, module: &Module) -> Result<PathBuf, String> {
    Ok(resolve_module_dir(app, module)?.join(format!("{}.version", module.id)))
}

/// Records the tag/version last successfully installed for a module, on
/// disk, independent of any HTTP healthcheck. This is what lets
/// `HealthCheckKind::None` modules (cloudflared, which exposes no local
/// `/version` endpoint) still report an installed version to the frontend,
/// the same way the pre-Phase-3 `tunnel_manager.rs` wrote a
/// `cloudflared.version` file for the same reason.
fn write_installed_version_record(app: &AppHandle, module: &Module, version: &str) {
    let Ok(version_path) = resolve_installed_version_file_path(app, module) else {
        return;
    };
    if let Err(error) = std::fs::write(&version_path, version) {
        println!("{}", LogMessage::ModuleReplaceFailed(module.id.clone(), format!("failed to record installed version: {error}")).text());
    }
}

fn read_installed_version_record(app: &AppHandle, module: &Module) -> Option<String> {
    let version_path = resolve_installed_version_file_path(app, module).ok()?;
    std::fs::read_to_string(version_path).ok().map(|content| content.trim().to_string())
}

async fn fetch_local_module_version(app: &AppHandle, module: &Module) -> Option<String> {
    if let HealthCheckKind::Http { local_version_path } = &module.health_check {
        if let Some(port) = resolve_healthcheck_port(app, local_version_path) {
            let url = format!("http://127.0.0.1:{port}/version");
            if let Some(version) = fetch_version_from_url(&url).await {
                return Some(version);
            }
        }
    }
    read_installed_version_record(app, module)
}

fn resolve_healthcheck_port(app: &AppHandle, local_version_path: &str) -> Option<u16> {
    let system_config = crate::config::get_system_config(app).ok()?;
    let mut current = &system_config;
    for segment in local_version_path.split('.') {
        current = current.get(segment)?;
    }
    current.as_u64().and_then(|value| u16::try_from(value).ok())
}

async fn fetch_version_from_url(url: &str) -> Option<String> {
    let client = build_http_client(request_timeout().as_secs()).ok()?;
    let response = client.get(url).send().await.ok()?;
    if !response.status().is_success() {
        return None;
    }
    let raw_body = response.text().await.ok()?;
    let parsed: LocalVersionResponse = serde_json::from_str(&raw_body).ok()?;
    Some(parsed.version)
}

async fn wait_for_module_healthy(app: &AppHandle, module: &Module) -> bool {
    if module.strategy == InstallStrategy::Dylib {
        return core_loader::is_loaded();
    }
    if matches!(module.health_check, HealthCheckKind::None) {
        return true;
    }
    for _ in 0..POST_INSTALL_HEALTHCHECK_ATTEMPTS {
        if fetch_local_module_version(app, module).await.is_some() {
            return true;
        }
        tokio::time::sleep(Duration::from_millis(POST_INSTALL_HEALTHCHECK_DELAY_MS)).await;
    }
    false
}

fn resolve_releases_repo_override(app: &AppHandle, module: &Module) -> String {
    if !module.release_repo.is_empty() {
        return module.release_repo.clone();
    }
    crate::config::get_system_config(app)
        .ok()
        .and_then(|system_config| {
            system_config
                .get("releases")
                .and_then(|releases| releases.get("repo"))
                .and_then(|value| value.as_str())
                .map(|repo| repo.to_string())
        })
        .unwrap_or_default()
}

pub async fn fetch_latest_module_release(app: &AppHandle, module: &Module) -> Result<(String, String), String> {
    let repo = resolve_releases_repo_override(app, module);
    if repo.is_empty() {
        return Err(LogMessage::ModuleReleaseFetchFailed(module.id.clone(), "no release repo configured".to_string()).text());
    }
    let releases_url = format!("https://api.github.com/repos/{repo}/releases");

    let client = build_http_client(request_timeout().as_secs())
        .map_err(|error| LogMessage::ModuleReleaseFetchFailed(module.id.clone(), error).text())?;
    let response = client
        .get(&releases_url)
        .header("Accept", GITHUB_API_ACCEPT_HEADER)
        .header("User-Agent", GITHUB_USER_AGENT)
        .send()
        .await
        .map_err(|error| LogMessage::ModuleReleaseFetchFailed(module.id.clone(), error.to_string()).text())?;

    if !response.status().is_success() {
        return Err(LogMessage::ModuleReleaseFetchFailed(module.id.clone(), format!("{releases_url} responded with HTTP {}", response.status())).text());
    }

    let releases: Vec<GithubRelease> = response
        .json()
        .await
        .map_err(|error| LogMessage::ModuleReleaseFetchFailed(module.id.clone(), error.to_string()).text())?;

    let matching = releases
        .into_iter()
        .find(|release| !release.draft && !release.prerelease && release.tag_name.starts_with(&module.tag_prefix))
        .ok_or_else(|| LogMessage::ModuleReleaseFetchFailed(module.id.clone(), format!("no published {}* release found", module.tag_prefix)).text())?;

    let download_url = matching
        .assets
        .iter()
        .find(|asset| asset.name.eq_ignore_ascii_case(&module.binary_filename))
        .map(|asset| asset.browser_download_url.clone())
        .ok_or_else(|| LogMessage::ModuleReleaseFetchFailed(module.id.clone(), format!("release {} has no {} asset", matching.tag_name, module.binary_filename)).text())?;

    Ok((matching.tag_name, download_url))
}

pub fn tag_to_version_name(module: &Module, tag_name: &str) -> String {
    tag_name.trim_start_matches(&module.tag_prefix).to_string()
}

/// Releases whatever is holding the module's writable binary locked on
/// disk before `backup_current_binary` tries to rename it away. For a
/// `Process` module that means killing the tracked child (and any orphan
/// sharing its binary name via `taskkill`). For a `Dylib` module there is
/// no process to kill: `core_loader::unload` drops the loaded library,
/// which unmaps the `.dll` from this process (`FreeLibrary` via
/// `libloading`'s `Drop`), the in-process equivalent of killing a child.
fn stop_module_for_replace(app: &AppHandle, module: &Module) {
    if module.strategy == InstallStrategy::Dylib {
        core_loader::unload();
        return;
    }
    kill_running_module(app, &module.id).ok();
    kill_orphaned_module_processes_by_name(module);
}

/// Starts a freshly installed (or rolled-back) module binary. For
/// `Process` this spawns the child process as before. For `Dylib` there is
/// nothing to spawn: `core_loader::load_or_rollback` loads the `.dll` and
/// verifies its `CORE_ABI_VERSION` before anything else, so success here
/// means both "the file loaded" and "the ABI matched", not just a process
/// starting.
fn spawn_or_load_module(app: &AppHandle, module: &Module) -> Result<(), String> {
    if module.strategy == InstallStrategy::Process {
        return spawn_installed_module(app, module);
    }
    core_loader::load_or_rollback(app);
    if core_loader::is_loaded() {
        return Ok(());
    }
    Err(LogMessage::ModuleSpawnFailed(module.id.clone(), "Velo-Core failed to load".to_string()).text())
}

fn spawn_process_module(app: &AppHandle, module: &Module, writable_path: &PathBuf, args: &[String]) -> Result<(), String> {
    let mut command = std::process::Command::new(writable_path);
    command.args(args).creation_flags(CREATE_NO_WINDOW);

    let child = command.spawn().map_err(|error| LogMessage::ModuleSpawnFailed(module.id.clone(), error.to_string()).text())?;
    println!("{}", LogMessage::ModuleSpawned(module.id.clone(), writable_path.display().to_string()).text());
    app.state::<ModuleRegistry>().processes.lock().unwrap().insert(module.id.clone(), child);
    Ok(())
}

/// Spawns whatever binary is already installed for this module, with no
/// arguments. Callers needing arguments (the tunnel module's `tunnel run
/// --token <token>`) should use `spawn_process_module` directly.
pub fn spawn_installed_module(app: &AppHandle, module: &Module) -> Result<(), String> {
    let writable_path = resolve_writable_binary_path(app, module)?;
    if !writable_path.exists() {
        return Err(LogMessage::ModuleNotInstalled(module.id.clone()).text());
    }
    spawn_process_module(app, module, &writable_path, &[])
}

pub fn spawn_installed_module_with_args(app: &AppHandle, module: &Module, args: &[String]) -> Result<(), String> {
    let writable_path = resolve_writable_binary_path(app, module)?;
    if !writable_path.exists() {
        return Err(LogMessage::ModuleNotInstalled(module.id.clone()).text());
    }
    spawn_process_module(app, module, &writable_path, args)
}

/// Takes a module id rather than a full `Module` on purpose: killing an
/// already-tracked child process only ever needs the id to look it up in
/// `ModuleRegistry`, never the rest of the module's description (binary
/// name, release repo, health check kind). Callers that already have a
/// resolved `Module` can pass `&module.id`; callers on a shutdown path
/// (app exit, tray quit) that cannot afford to await a manifest fetch just
/// to kill a process already in memory can pass a plain id instead.
pub fn kill_running_module(app: &AppHandle, module_id: &str) -> Result<(), String> {
    let state = app.state::<ModuleRegistry>();
    let mut guard = state.processes.lock().unwrap();
    let Some(mut child) = guard.remove(module_id) else {
        return Ok(());
    };
    child.kill().map_err(|_| LogMessage::ModuleKillFailed(module_id.to_string()).text())?;
    child.wait().map_err(|_| LogMessage::ModuleKillFailed(module_id.to_string()).text())?;
    Ok(())
}

pub fn stop_module_before_exit(app: &AppHandle, module_id: &str) {
    if let Some(mut child) = app.state::<ModuleRegistry>().processes.lock().unwrap().remove(module_id) {
        let _ = child.kill();
    }
}

pub fn kill_orphaned_module_processes_by_name(module: &Module) {
    let result = std::process::Command::new("taskkill")
        .args(["/IM", &module.binary_filename, "/F"])
        .creation_flags(CREATE_NO_WINDOW)
        .output();

    match result {
        Ok(output) if output.status.success() => println!("{}", LogMessage::ModuleOrphanKillSucceeded(module.id.clone()).text()),
        Ok(_) => println!("{}", LogMessage::ModuleOrphanKillNoneFound(module.id.clone()).text()),
        Err(error) => println!("{}", LogMessage::ModuleOrphanKillFailed(module.id.clone(), error.to_string()).text()),
    }
}

fn take_or_create_cancellation_token(app: &AppHandle, module: &Module) -> CancellationToken {
    let state = app.state::<ModuleRegistry>();
    let mut guard = state.cancellations.lock().unwrap();
    let token = CancellationToken::new();
    guard.insert(module.id.clone(), token.clone());
    token
}

fn clear_cancellation_token(app: &AppHandle, module: &Module) {
    app.state::<ModuleRegistry>().cancellations.lock().unwrap().remove(&module.id);
}

pub fn cancel_module_update(app: &AppHandle, module: &Module) {
    let state = app.state::<ModuleRegistry>();
    let guard = state.cancellations.lock().unwrap();
    if let Some(token) = guard.get(&module.id) {
        token.cancel();
    }
}

async fn download_new_module_binary(
    app: &AppHandle,
    module: &Module,
    download_url: &str,
    partial_path: &PathBuf,
    cancellation: &CancellationToken,
) -> Result<Vec<u8>, String> {
    let event_name = module.progress_event_name();
    let bytes = download_with_progress(app, &event_name, download_url, partial_path, cancellation)
        .await
        .map_err(|error| match error {
            DownloadError::Cancelled => {
                println!("{}", LogMessage::ModuleUpdateCancelled(module.id.clone()).text());
                CANCELLED_ERROR.to_string()
            }
            DownloadError::Failed(reason) => LogMessage::ModuleDownloadFailed(module.id.clone(), reason).text(),
        })?;

    emit_progress(app, &event_name, UpdateProgress::Verifying);
    if bytes.is_empty() {
        return Err(LogMessage::ModuleDownloadFailed(module.id.clone(), "downloaded binary is empty".to_string()).text());
    }
    Ok(bytes)
}

fn rename_with_retry(app: &AppHandle, module: &Module, temp_path: &PathBuf, destination_path: &PathBuf, progress_phase: UpdateProgress) -> Result<(), String> {
    let event_name = module.progress_event_name();
    let mut last_error = String::new();
    for attempt in 1..=REPLACE_MAX_ATTEMPTS {
        match std::fs::rename(temp_path, destination_path) {
            Ok(()) => return Ok(()),
            Err(error) => {
                last_error = error.to_string();
                println!("{}", LogMessage::ModuleReplaceRetrying(module.id.clone(), attempt, last_error.clone()).text());
                emit_progress(app, &event_name, progress_phase.clone());
                let delay = REPLACE_RETRY_BASE_DELAY_MS * attempt as u64;
                std::thread::sleep(std::time::Duration::from_millis(delay));
            }
        }
    }
    Err(LogMessage::ModuleReplaceFailed(module.id.clone(), last_error).text())
}

fn backup_current_binary(app: &AppHandle, module: &Module, writable_path: &PathBuf, backup_path: &PathBuf) -> Result<(), String> {
    if !writable_path.exists() {
        return Ok(());
    }
    emit_progress(app, &module.progress_event_name(), UpdateProgress::BackingUp);
    std::fs::rename(writable_path, backup_path).map_err(|error| LogMessage::ModuleReplaceFailed(module.id.clone(), error.to_string()).text())
}

fn install_new_binary(app: &AppHandle, module: &Module, writable_path: &PathBuf, new_binary: &[u8]) -> Result<(), String> {
    let parent = writable_path
        .parent()
        .ok_or_else(|| LogMessage::ModuleDataDirResolveFailed(module.id.clone()).text())?;
    std::fs::create_dir_all(parent).map_err(|error| LogMessage::ModuleReplaceFailed(module.id.clone(), error.to_string()).text())?;

    let temp_path = PathBuf::from(format!("{}.new", writable_path.display()));
    std::fs::write(&temp_path, new_binary).map_err(|error| LogMessage::ModuleReplaceFailed(module.id.clone(), error.to_string()).text())?;

    emit_progress(app, &module.progress_event_name(), UpdateProgress::InstallingNew);
    rename_with_retry(app, module, &temp_path, writable_path, UpdateProgress::InstallingNew)
}

async fn rollback_to_previous_binary(app: &AppHandle, module: &Module, writable_path: &PathBuf, backup_path: &PathBuf, reason: String) -> String {
    let event_name = module.progress_event_name();
    if !backup_path.exists() {
        let message = format!("{reason} (no backup available to roll back to)");
        emit_progress(app, &event_name, UpdateProgress::Failed { message: message.clone() });
        return message;
    }

    std::fs::remove_file(writable_path).ok();
    if let Err(rename_error) = rename_with_retry(app, module, backup_path, writable_path, UpdateProgress::BackingUp) {
        let message = format!("{reason} (rollback also failed: {rename_error})");
        emit_progress(app, &event_name, UpdateProgress::Failed { message: message.clone() });
        return message;
    }

    if spawn_or_load_module(app, module).is_ok() {
        let message = format!("{reason} (rolled back to previous version)");
        println!("{}", LogMessage::ModuleUpdateRolledBack(module.id.clone(), reason.clone()).text());
        emit_progress(app, &event_name, UpdateProgress::RolledBack { message: message.clone() });
        return message;
    }

    let message = format!("{reason} (rolled back binary but failed to restart it)");
    emit_progress(app, &event_name, UpdateProgress::Failed { message: message.clone() });
    message
}

/// Kills whatever is running, backs up the current binary, installs the new
/// one, restarts it, and waits for the healthcheck before declaring success.
/// Any failure along the way triggers `rollback_to_previous_binary`, whose
/// backup/rollback steps are already no-ops when nothing was installed yet,
/// so this is also safe to use for a first-run install.
pub async fn replace_and_restart_module(app: &AppHandle, module: &Module, writable_path: &PathBuf, backup_path: &PathBuf, new_binary: &[u8]) -> Result<(), String> {
    stop_module_for_replace(app, module);
    backup_current_binary(app, module, writable_path, backup_path)?;

    if let Err(install_error) = install_new_binary(app, module, writable_path, new_binary) {
        return Err(rollback_to_previous_binary(app, module, writable_path, backup_path, install_error).await);
    }

    emit_progress(app, &module.progress_event_name(), UpdateProgress::Starting);
    if let Err(spawn_error) = spawn_or_load_module(app, module) {
        return Err(rollback_to_previous_binary(app, module, writable_path, backup_path, spawn_error).await);
    }

    if !wait_for_module_healthy(app, module).await {
        let reason = format!("new {} binary started but did not respond to its healthcheck", module.id);
        return Err(rollback_to_previous_binary(app, module, writable_path, backup_path, reason).await);
    }

    emit_progress(app, &module.progress_event_name(), UpdateProgress::RemovingOld);
    std::fs::remove_file(backup_path).ok();
    Ok(())
}

/// First-run install path: fetches the latest published release matching
/// the module's tag prefix and installs it exactly like a normal update
/// would, then spawns it.
pub async fn install_latest_release_and_spawn(app: &AppHandle, module: &Module) -> Result<String, String> {
    println!("{}", LogMessage::ModuleFirstRunInstallStarted(module.id.clone()).text());

    let writable_path = resolve_writable_binary_path(app, module)?;
    let (tag_name, download_url) = fetch_latest_module_release(app, module)
        .await
        .map_err(|error| LogMessage::ModuleFirstRunInstallFailed(module.id.clone(), error).text())?;
    let partial_path = resolve_partial_download_path(app, module)?;
    let backup_path = resolve_backup_binary_path(app, module)?;
    let cancellation = CancellationToken::new();

    let new_binary = download_new_module_binary(app, module, &download_url, &partial_path, &cancellation)
        .await
        .map_err(|error| LogMessage::ModuleFirstRunInstallFailed(module.id.clone(), error).text())?;

    replace_and_restart_module(app, module, &writable_path, &backup_path, &new_binary)
        .await
        .map_err(|error| LogMessage::ModuleFirstRunInstallFailed(module.id.clone(), error).text())?;

    let version = tag_to_version_name(module, &tag_name);
    write_installed_version_record(app, module, &version);
    println!("{}", LogMessage::ModuleFirstRunInstallCompleted(module.id.clone(), version.clone()).text());
    Ok(version)
}

/// Downloads and installs the latest release matching the module's tag
/// prefix onto disk, without spawning it afterward. For modules whose
/// caller needs to control the exact spawn arguments (the tunnel module's
/// `tunnel run --token <token>`), spawning here and immediately killing it
/// to respawn with args would start the process twice for no reason.
/// Backup/rollback still runs exactly as it does for a normal update, so a
/// failed install here cannot leave a half-written binary behind; the only
/// difference from `install_latest_release_and_spawn` is the final spawn
/// step is the caller's responsibility.
pub async fn download_and_install_latest_release(app: &AppHandle, module: &Module) -> Result<String, String> {
    println!("{}", LogMessage::ModuleFirstRunInstallStarted(module.id.clone()).text());

    let writable_path = resolve_writable_binary_path(app, module)?;
    let (tag_name, download_url) = fetch_latest_module_release(app, module)
        .await
        .map_err(|error| LogMessage::ModuleFirstRunInstallFailed(module.id.clone(), error).text())?;
    let partial_path = resolve_partial_download_path(app, module)?;
    let backup_path = resolve_backup_binary_path(app, module)?;
    let cancellation = CancellationToken::new();

    let new_binary = download_new_module_binary(app, module, &download_url, &partial_path, &cancellation)
        .await
        .map_err(|error| LogMessage::ModuleFirstRunInstallFailed(module.id.clone(), error).text())?;

    kill_running_module(app, &module.id).ok();
    kill_orphaned_module_processes_by_name(module);
    backup_current_binary(app, module, &writable_path, &backup_path)
        .map_err(|error| LogMessage::ModuleFirstRunInstallFailed(module.id.clone(), error).text())?;
    if let Err(install_error) = install_new_binary(app, module, &writable_path, &new_binary) {
        std::fs::remove_file(&writable_path).ok();
        if backup_path.exists() {
            std::fs::rename(&backup_path, &writable_path).ok();
        }
        return Err(LogMessage::ModuleFirstRunInstallFailed(module.id.clone(), install_error).text());
    }
    emit_progress(app, &module.progress_event_name(), UpdateProgress::RemovingOld);
    std::fs::remove_file(&backup_path).ok();

    let version = tag_to_version_name(module, &tag_name);
    println!("{}", LogMessage::ModuleFirstRunInstallCompleted(module.id.clone(), version.clone()).text());
    Ok(version)
}

/// Entry point for anything that needs a module running but cannot assume
/// it is already installed: app startup, and the manual Start button if the
/// user uninstalled or never had a first-run install succeed.
pub async fn ensure_module_installed_and_spawn(app: &AppHandle, module: &Module) -> Result<(), String> {
    let writable_path = resolve_writable_binary_path(app, module)?;
    if writable_path.exists() {
        return spawn_or_load_module(app, module);
    }
    install_latest_release_and_spawn(app, module).await.map(|_| ())
}

pub async fn get_module_status(app: &AppHandle, module: &Module) -> ModuleStatus {
    let version = fetch_local_module_version(app, module).await;
    let running = resolve_running_state(app, module, version.is_some());
    ModuleStatus { running, installed: is_module_installed(app, module), version }
}

/// A `Dylib` module has no child process to look up in `ModuleRegistry` and
/// no reason to go through `HealthCheckKind` at all: `core_loader::is_loaded`
/// is the direct, synchronous source of truth for whether Velo-Core is
/// mapped into this process right now.
fn resolve_running_state(app: &AppHandle, module: &Module, has_version: bool) -> bool {
    if module.strategy == InstallStrategy::Dylib {
        return core_loader::is_loaded();
    }
    match module.health_check {
        HealthCheckKind::Http { .. } => has_version,
        HealthCheckKind::None => app.state::<ModuleRegistry>().processes.lock().unwrap().contains_key(&module.id),
    }
}

pub async fn check_module_update(app: &AppHandle, module: &Module) -> Result<ModuleUpdateInfo, String> {
    let current_version = fetch_local_module_version(app, module).await;
    let (tag_name, _download_url) = fetch_latest_module_release(app, module).await?;
    let latest_version = tag_to_version_name(module, &tag_name);

    let available = match &current_version {
        Some(current) => current != &latest_version,
        None => true,
    };

    Ok(ModuleUpdateInfo { available, current_version, latest_version: Some(latest_version) })
}

/// Retries removing a module's directory a few times before giving up, to
/// survive Windows briefly holding a just-killed .exe's image section
/// locked immediately after the process exits. See the equivalent original
/// comment in the pre-Phase-3 `server_manager.rs` for the full explanation;
/// this is the same behavior generalized to any process-strategy module.
pub fn remove_module_binary_and_directory(app: &AppHandle, module: &Module) -> Result<(), String> {
    if module.strategy == InstallStrategy::Dylib {
        core_loader::unload();
    }
    let writable_path = resolve_writable_binary_path(app, module)?;
    if !writable_path.exists() {
        return Ok(());
    }
    let module_dir = writable_path
        .parent()
        .ok_or_else(|| LogMessage::ModuleDataDirResolveFailed(module.id.clone()).text())?;

    std::thread::sleep(std::time::Duration::from_millis(UNINSTALL_INITIAL_DELAY_MS));

    let mut last_error = String::new();
    for attempt in 1..=UNINSTALL_MAX_ATTEMPTS {
        match std::fs::remove_dir_all(module_dir) {
            Ok(()) => return Ok(()),
            Err(error) => {
                last_error = error.to_string();
                println!("{}", LogMessage::ModuleUninstallRetrying(module.id.clone(), attempt, last_error.clone()).text());
                let delay = UNINSTALL_RETRY_BASE_DELAY_MS * attempt as u64;
                std::thread::sleep(std::time::Duration::from_millis(delay));
            }
        }
    }
    Err(LogMessage::ModuleUninstallFailed(module.id.clone(), last_error).text())
}

pub async fn install_module_update(app: &AppHandle, module: &Module) -> Result<ModuleStatus, String> {
    let event_name = module.progress_event_name();
    let cancellation = take_or_create_cancellation_token(app, module);
    emit_progress(app, &event_name, UpdateProgress::CheckingRelease);

    let previous_version = fetch_local_module_version(app, module).await.unwrap_or_default();
    let fail = |app: &AppHandle, error: String| -> String {
        clear_cancellation_token(app, module);
        emit_progress(app, &event_name, UpdateProgress::Failed { message: error.clone() });
        error
    };

    let (tag_name, download_url) = match fetch_latest_module_release(app, module).await {
        Ok(result) => result,
        Err(error) => return Err(fail(app, error)),
    };
    let partial_path = match resolve_partial_download_path(app, module) {
        Ok(path) => path,
        Err(error) => return Err(fail(app, error)),
    };
    let writable_path = match resolve_writable_binary_path(app, module) {
        Ok(path) => path,
        Err(error) => return Err(fail(app, error)),
    };
    let backup_path = match resolve_backup_binary_path(app, module) {
        Ok(path) => path,
        Err(error) => return Err(fail(app, error)),
    };

    let new_binary = match download_new_module_binary(app, module, &download_url, &partial_path, &cancellation).await {
        Ok(bytes) => bytes,
        Err(error) if error == CANCELLED_ERROR => {
            clear_cancellation_token(app, module);
            return Err(CANCELLED_ERROR.to_string());
        }
        Err(error) => return Err(fail(app, error)),
    };

    if let Err(error) = replace_and_restart_module(app, module, &writable_path, &backup_path, &new_binary).await {
        clear_cancellation_token(app, module);
        return Err(error);
    }

    clear_cancellation_token(app, module);
    let latest_version = tag_to_version_name(module, &tag_name);
    println!("{}", LogMessage::ModuleUpdateInstalled(module.id.clone(), previous_version, latest_version.clone()).text());
    emit_progress(app, &event_name, UpdateProgress::Done { version: latest_version.clone() });

    Ok(ModuleStatus { running: true, installed: true, version: Some(latest_version) })
}

/// Installs a binary supplied directly by the caller (a local file picked
/// in the dev Console tab, bypassing the GitHub Releases lookup) through
/// the same backup, install, restart, and healthcheck-gated rollback
/// sequence a real update uses, so a bad manual build can't brick the
/// installed module either. Unlike `install_module_update`, there is no
/// release tag to report, so the returned version comes from the module's
/// own healthcheck after it restarts.
pub async fn install_module_from_bytes(app: &AppHandle, module: &Module, bytes: &[u8]) -> Result<ModuleStatus, String> {
    let event_name = module.progress_event_name();
    emit_progress(app, &event_name, UpdateProgress::Verifying);

    let previous_version = fetch_local_module_version(app, module).await.unwrap_or_default();
    let writable_path = resolve_writable_binary_path(app, module)?;
    let backup_path = resolve_backup_binary_path(app, module)?;

    replace_and_restart_module(app, module, &writable_path, &backup_path, bytes).await?;

    let installed_version = fetch_local_module_version(app, module).await.unwrap_or_else(|| "unknown".to_string());
    println!("{}", LogMessage::ModuleUpdateInstalled(module.id.clone(), previous_version, installed_version.clone()).text());
    emit_progress(app, &event_name, UpdateProgress::Done { version: installed_version.clone() });

    Ok(ModuleStatus { running: true, installed: true, version: Some(installed_version) })
}
