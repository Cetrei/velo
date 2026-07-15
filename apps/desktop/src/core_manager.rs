use crate::core_loader;
use crate::log_messages::LogMessage;
use crate::manifest;
use crate::module_manager::{self, Module, ModuleStatus};
use tauri::AppHandle;

const CORE_MODULE_ID: &str = "core";

/// Resolves this module's static description from the signed manifest,
/// mirroring `server_manager::resolve_server_module` and
/// `tunnel_manager::resolve_tunnel_module`. See `resolve_server_module`'s
/// doc comment for why this fails outright instead of falling back to a
/// hardcoded description when the manifest cannot be resolved at all.
async fn resolve_core_module(app: &AppHandle) -> Result<Module, String> {
    let modules = manifest::fetch_and_verify_modules(app).await?;
    modules
        .into_iter()
        .find(|module| module.id == CORE_MODULE_ID)
        .ok_or_else(|| LogMessage::ModuleNotInManifest(CORE_MODULE_ID.to_string()).text())
}

/// Entry point for app startup, called from `main.rs`'s `.setup()` the same
/// way `server_manager::ensure_backend_installed_and_spawn` and
/// `tunnel_manager::sync_tunnel_with_config` are: resolves `core` from the
/// manifest and installs/loads it through the generic engine
/// (`module_manager::ensure_module_installed_and_spawn`, whose `Dylib`
/// branch calls `core_loader::load_or_rollback` instead of spawning a
/// process). This is what actually gives Velo-Core the same fetch-latest-
/// release-on-first-run and update-on-request behavior `server`/`tunnel`
/// already have, instead of only ever loading whatever happens to already
/// be on disk.
///
/// Unlike `server`/`tunnel`, a manifest or network failure here is not
/// treated as "Core unavailable": `core_loader::load_or_rollback` already
/// has its own on-disk fallback to `velo_core.dll.backup`, and frame
/// pushing must keep working offline if a Core binary is already
/// installed. So if the manifest cannot be resolved at all (no network on
/// a fresh install with no cache yet, or no `core` entry in an old cached
/// manifest), this falls back to loading directly from disk, the same call
/// this function replaces in `main.rs`.
pub async fn ensure_core_installed_and_loaded(app: &AppHandle) {
    match resolve_core_module(app).await {
        Ok(module) => {
            if let Err(error) = module_manager::ensure_module_installed_and_spawn(app, &module).await {
                eprintln!("{error}");
            }
        }
        Err(error) => {
            eprintln!("{error}");
            core_loader::load_or_rollback(app);
        }
    }
}

/// Read-only status for the Console tab, mirroring `server_manager::get_server_status`
/// and `tunnel_manager::get_tunnel_status`. Unlike those two, Core has no manual
/// start/stop/update commands: it installs and updates itself automatically on
/// every startup through `ensure_core_installed_and_loaded`, so the Console only
/// ever needs to display this snapshot, never act on it. See TODO.md's Phase 4
/// Console-visibility flag for why manual control was deliberately left out.
#[tauri::command]
pub async fn get_core_status(app: AppHandle) -> ModuleStatus {
    let Ok(module) = resolve_core_module(&app).await else {
        return ModuleStatus { running: core_loader::is_loaded(), installed: core_loader::is_loaded(), version: None };
    };
    module_manager::get_module_status(&app, &module).await
}
