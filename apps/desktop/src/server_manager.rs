use crate::log_messages::LogMessage;
use crate::manifest;
use crate::module_manager::{self, Module, ModuleStatus, ModuleUpdateInfo};
use tauri::AppHandle;

const SERVER_MODULE_ID: &str = "server";

/// Resolves this module's static description from the signed manifest
/// (`manifest::fetch_and_verify_modules`, itself falling back to the last
/// verified manifest cached on disk if the network fetch fails) instead of
/// a hardcoded constant, per Phase 3's goal of policy (which modules exist,
/// where their releases live) living entirely outside shell code. If the
/// manifest cannot be resolved at all (no network on a fresh install with
/// no cache yet, or a genuinely missing entry), this fails outright rather
/// than silently falling back to a hardcoded description, since that would
/// reintroduce the exact duplication this phase exists to remove.
async fn resolve_server_module(app: &AppHandle) -> Result<Module, String> {
    let modules = manifest::fetch_and_verify_modules(app).await?;
    modules
        .into_iter()
        .find(|module| module.id == SERVER_MODULE_ID)
        .ok_or_else(|| LogMessage::ModuleNotInManifest(SERVER_MODULE_ID.to_string()).text())
}

/// Entry point for anything that needs the backend running but cannot
/// assume it is already installed: app startup, and the manual Start
/// button if the user uninstalled or never had a first-run install
/// succeed. Spawns directly when already installed; otherwise fetches and
/// installs the latest server-v* release first.
pub async fn ensure_backend_installed_and_spawn(app: &AppHandle) -> Result<(), String> {
    let module = resolve_server_module(app).await?;
    module_manager::ensure_module_installed_and_spawn(app, &module).await
}

/// Takes only the module id, not the resolved `Module`, because this runs
/// on the app-exit and tray-quit shutdown paths, which are synchronous and
/// cannot afford to await a manifest fetch just to kill a process already
/// tracked in `ModuleRegistry`.
pub fn stop_backend_before_exit(app: &AppHandle) {
    module_manager::stop_module_before_exit(app, SERVER_MODULE_ID);
}

#[tauri::command]
pub async fn get_server_status(app: AppHandle) -> ModuleStatus {
    let Ok(module) = resolve_server_module(&app).await else {
        return ModuleStatus { running: false, installed: false, version: None };
    };
    module_manager::get_module_status(&app, &module).await
}

#[tauri::command]
pub async fn start_server(app: AppHandle) -> Result<ModuleStatus, String> {
    let module = resolve_server_module(&app).await?;
    module_manager::ensure_module_installed_and_spawn(&app, &module).await?;
    Ok(module_manager::get_module_status(&app, &module).await)
}

#[tauri::command]
pub async fn restart_server(app: AppHandle) -> Result<ModuleStatus, String> {
    let module = resolve_server_module(&app).await?;
    module_manager::kill_running_module(&app, &module.id)?;
    module_manager::ensure_module_installed_and_spawn(&app, &module).await?;
    Ok(module_manager::get_module_status(&app, &module).await)
}

#[tauri::command]
pub async fn stop_server(app: AppHandle) -> Result<ModuleStatus, String> {
    let module = resolve_server_module(&app).await?;
    module_manager::kill_running_module(&app, &module.id)?;
    Ok(ModuleStatus { running: false, installed: module_manager::is_module_installed(&app, &module), version: None })
}

#[tauri::command]
pub async fn uninstall_server(app: AppHandle) -> Result<ModuleStatus, String> {
    let module = resolve_server_module(&app).await?;
    module_manager::kill_running_module(&app, &module.id)?;
    module_manager::kill_orphaned_module_processes_by_name(&module);
    module_manager::remove_module_binary_and_directory(&app, &module)?;
    println!("{}", LogMessage::ServerUninstalled.text());
    Ok(ModuleStatus { running: false, installed: false, version: None })
}

#[tauri::command]
pub async fn check_server_update(app: AppHandle) -> Result<ModuleUpdateInfo, String> {
    let module = resolve_server_module(&app).await?;
    module_manager::check_module_update(&app, &module).await
}

#[tauri::command]
pub async fn install_server_update(app: AppHandle) -> Result<ModuleStatus, String> {
    let module = resolve_server_module(&app).await?;
    module_manager::install_module_update(&app, &module).await
}

#[tauri::command]
pub async fn cancel_server_update(app: AppHandle) {
    let Ok(module) = resolve_server_module(&app).await else {
        return;
    };
    module_manager::cancel_module_update(&app, &module);
}

const DEV_SIDELOAD_MIN_SIZE_BYTES: usize = 1024;

/// Installs a backend binary supplied directly by the developer from the
/// Console tab, bypassing the GitHub Releases lookup entirely. This exists
/// for local iteration: a freshly `bun run build:server`-compiled exe often
/// has no matching `server-v*` GitHub release yet, so the normal update
/// path has nothing to check against. Reuses the same backup, install,
/// restart, and healthcheck-gated rollback sequence as a real update so a
/// bad manual build can't brick the installed backend either.
#[tauri::command]
pub async fn install_server_from_bytes(app: AppHandle, bytes: Vec<u8>) -> Result<ModuleStatus, String> {
    if bytes.len() < DEV_SIDELOAD_MIN_SIZE_BYTES {
        return Err(LogMessage::ServerDownloadFailed("selected file is too small to be a real backend binary".to_string()).text());
    }
    let module = resolve_server_module(&app).await?;
    module_manager::install_module_from_bytes(&app, &module, &bytes).await
}
