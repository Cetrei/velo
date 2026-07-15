use crate::log_messages::LogMessage;
use crate::manifest;
use crate::module_manager::{self, Module, ModuleStatus, ModuleUpdateInfo};
use crate::update_progress::{emit_progress, UpdateProgress, TUNNEL_UPDATE_PROGRESS_EVENT};
use tauri::AppHandle;

const TUNNEL_MODULE_ID: &str = "tunnel";

/// Resolves this module's static description from the signed manifest,
/// mirroring `server_manager::resolve_server_module`. See that function's
/// doc comment for why this fails outright instead of falling back to a
/// hardcoded description when the manifest cannot be resolved at all.
async fn resolve_tunnel_module(app: &AppHandle) -> Result<Module, String> {
    let modules = manifest::fetch_and_verify_modules(app).await?;
    modules
        .into_iter()
        .find(|module| module.id == TUNNEL_MODULE_ID)
        .ok_or_else(|| LogMessage::ModuleNotInManifest(TUNNEL_MODULE_ID.to_string()).text())
}

fn read_managed_tunnel_settings(app: &AppHandle) -> Result<(bool, String), String> {
    let user_config = crate::config::get_user_config(app)?;
    let cloudflare_relay = user_config
        .get("connection")
        .and_then(|connection| connection.get("cloudflare_relay"))
        .ok_or_else(|| LogMessage::TunnelConfigMissing.text())?;

    let managed = cloudflare_relay
        .get("managed")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    let token = cloudflare_relay
        .get("tunnel_token")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();

    Ok((managed, token))
}

/// Ensures the managed cloudflared binary is installed and up to date, then
/// spawns it with the configured tunnel token. Unlike the server module,
/// the tunnel needs an argument (`tunnel run --token <token>`), so this
/// bypasses `ensure_module_installed_and_spawn` and drives the generic
/// engine's lower-level pieces directly: check for updates, install if
/// needed, then spawn with args.
async fn ensure_tunnel_installed_and_spawn_with_token(app: &AppHandle, token: &str) -> Result<(), String> {
    let module = resolve_tunnel_module(app).await?;
    let needs_install = !module_manager::is_module_installed(app, &module)
        || module_manager::check_module_update(app, &module).await.map(|info| info.available).unwrap_or(false);
    if needs_install {
        module_manager::download_and_install_latest_release(app, &module).await?;
    }

    emit_progress(app, TUNNEL_UPDATE_PROGRESS_EVENT, UpdateProgress::Starting);
    let args = vec!["tunnel".to_string(), "run".to_string(), "--token".to_string(), token.to_string()];
    module_manager::spawn_installed_module_with_args(app, &module, &args)
}

pub fn sync_tunnel_with_config(app: &AppHandle) {
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(error) = try_sync_tunnel_with_config(&app_handle).await {
            eprintln!("{error}");
        }
    });
}

async fn try_sync_tunnel_with_config(app: &AppHandle) -> Result<(), String> {
    let (managed, token) = read_managed_tunnel_settings(app)?;
    module_manager::kill_running_module(app, TUNNEL_MODULE_ID)?;

    if !managed || token.is_empty() {
        println!("{}", LogMessage::TunnelStartupSkippedUnmanaged.text());
        return Ok(());
    }

    ensure_tunnel_installed_and_spawn_with_token(app, &token).await
}

#[tauri::command]
pub async fn get_tunnel_status(app: AppHandle) -> ModuleStatus {
    let Ok(module) = resolve_tunnel_module(&app).await else {
        return ModuleStatus { running: false, installed: false, version: None };
    };
    module_manager::get_module_status(&app, &module).await
}

#[tauri::command]
pub async fn check_tunnel_update(app: AppHandle) -> Result<ModuleUpdateInfo, String> {
    let module = resolve_tunnel_module(&app).await?;
    module_manager::check_module_update(&app, &module).await
}

#[tauri::command]
pub async fn restart_managed_tunnel(app: AppHandle) -> Result<ModuleStatus, String> {
    match try_sync_tunnel_with_config(&app).await {
        Ok(()) => {
            let module = resolve_tunnel_module(&app).await?;
            let status = module_manager::get_module_status(&app, &module).await;
            let version = status.version.clone().unwrap_or_default();
            emit_progress(&app, TUNNEL_UPDATE_PROGRESS_EVENT, UpdateProgress::Done { version });
            Ok(status)
        }
        Err(error) => {
            emit_progress(&app, TUNNEL_UPDATE_PROGRESS_EVENT, UpdateProgress::Failed { message: error.clone() });
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn stop_managed_tunnel(app: AppHandle) -> Result<ModuleStatus, String> {
    let module = resolve_tunnel_module(&app).await?;
    module_manager::kill_running_module(&app, &module.id)?;
    Ok(module_manager::get_module_status(&app, &module).await)
}

/// Takes only the module id, same reasoning as
/// `server_manager::stop_backend_before_exit`: this runs on synchronous
/// shutdown paths that cannot await a manifest fetch.
pub fn stop_tunnel_before_exit(app: &AppHandle) {
    let is_managed = read_managed_tunnel_settings(app).map(|(managed, _)| managed).unwrap_or(false);
    if !is_managed {
        return;
    }
    module_manager::stop_module_before_exit(app, TUNNEL_MODULE_ID);
}
