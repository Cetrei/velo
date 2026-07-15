#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod core_loader;
mod core_manager;
mod driver_watchdog;
mod log_messages;
mod manifest;
mod module_manager;
mod server_manager;
mod tray;
mod tunnel_manager;
mod update_progress;

use log_messages::LogMessage;
use module_manager::ModuleRegistry;
use std::time::Duration;
use tauri::{Manager, WindowEvent};

#[tauri::command]
fn push_frame(bytes: Vec<u8>, width: u32, height: u32) -> Result<(), String> {
    if !driver_watchdog::is_registered() {
        return Err(LogMessage::DriverNotRegistered(driver_watchdog::configured_clsid()).text());
    }
    core_loader::write_frame(&bytes, width, height)
}

#[tauri::command]
fn get_driver_status() -> driver_watchdog::DriverStatus {
    driver_watchdog::status()
}

#[tauri::command]
fn get_system_config(app: tauri::AppHandle) -> Result<serde_yaml::Value, String> {
    config::get_system_config(&app)
}

#[tauri::command]
fn get_user_config(app: tauri::AppHandle) -> Result<serde_yaml::Value, String> {
    config::get_user_config(&app)
}

#[tauri::command]
fn save_user_config(app: tauri::AppHandle, new_config: serde_yaml::Value) -> Result<(), String> {
    config::save_user_config(&app, new_config)?;
    tunnel_manager::sync_tunnel_with_config(&app);
    Ok(())
}

#[tauri::command]
async fn close_splashscreen(app: tauri::AppHandle) -> Result<(), String> {
    const SPLASH_FADE_OUT_MS: u64 = 200;

    println!("{}", LogMessage::CloseSplashscreenInvoked.text());

    if let Some(splash) = app.get_webview_window("splashscreen") {
        let _ = splash.eval("document.body.classList.add('is-closing')");
        tokio::time::sleep(Duration::from_millis(SPLASH_FADE_OUT_MS)).await;
        let _ = splash.close();
    } else {
        println!("{}", LogMessage::SplashscreenWindowMissing.text());
    }

    let Some(main) = app.get_webview_window("main") else {
        return Err(LogMessage::MainWindowMissing.text());
    };
    main.show().map_err(|_| LogMessage::MainWindowShowFailed.text())?;
    let _ = main.set_focus();
    Ok(())
}

pub fn force_close_splashscreen_if_open(app: &tauri::AppHandle) {
    let Some(splash) = app.get_webview_window("splashscreen") else {
        return;
    };
    println!("{}", LogMessage::SplashscreenClosedFromMainShow.text());
    let _ = splash.close();
}

fn focus_existing_window(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    println!("{}", LogMessage::DuplicateInstanceBlocked.text());
    force_close_splashscreen_if_open(app);
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}

fn build_pages_url() -> tauri::Url {
    let raw_url = env!("VELO_PAGES_URL");
    raw_url
        .parse()
        .unwrap_or_else(|_| panic!("{}", LogMessage::PagesUrlInvalid(raw_url.to_string()).text()))
}

fn create_main_window(app: &tauri::AppHandle) -> tauri::Result<()> {
    let window = tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::External(build_pages_url()))
        .title("Velo")
        .inner_size(1024.0, 720.0)
        .resizable(true)
        .visible(false)
        .build()?;

    let app_handle = app.clone();
    window.on_window_event(move |event| handle_main_window_event(&app_handle, event));
    Ok(())
}

fn handle_main_window_event(app: &tauri::AppHandle, event: &WindowEvent) {
    let WindowEvent::CloseRequested { api, .. } = event else {
        return;
    };

    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    api.prevent_close();
    let _ = window.hide();
    println!("{}", LogMessage::WindowHiddenToTray.text());
}

fn should_autostart_server(app: &tauri::AppHandle) -> bool {
    match config::get_user_config(app) {
        Ok(user_config) => user_config
            .get("server")
            .and_then(|server| server.get("enabled"))
            .and_then(|value| value.as_bool())
            .unwrap_or(true),
        Err(_) => true,
    }
}

fn spawn_backend_on_setup(app: &tauri::AppHandle) {
    if !should_autostart_server(app) {
        println!("{}", LogMessage::ServerStartupSkippedDisabled.text());
        return;
    }
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(error) = server_manager::ensure_backend_installed_and_spawn(&app_handle).await {
            eprintln!("{error}");
        }
    });
}

fn ensure_core_on_setup(app: &tauri::AppHandle) {
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        core_manager::ensure_core_installed_and_loaded(&app_handle).await;
    });
}

fn stop_all_managed_processes(app: &tauri::AppHandle) {
    server_manager::stop_backend_before_exit(app);
    tunnel_manager::stop_tunnel_before_exit(app);
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            focus_existing_window(app);
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(ModuleRegistry::new())
        .invoke_handler(tauri::generate_handler![
            push_frame,
            get_driver_status,
            get_system_config,
            get_user_config,
            save_user_config,
            close_splashscreen,
            server_manager::get_server_status,
            server_manager::check_server_update,
            server_manager::install_server_update,
            server_manager::install_server_from_bytes,
            server_manager::cancel_server_update,
            server_manager::start_server,
            server_manager::restart_server,
            server_manager::stop_server,
            server_manager::uninstall_server,
            tunnel_manager::get_tunnel_status,
            tunnel_manager::check_tunnel_update,
            tunnel_manager::restart_managed_tunnel,
            tunnel_manager::stop_managed_tunnel,
            core_manager::get_core_status
        ])
        .setup(|app| {
            create_main_window(app.handle())?;
            tray::create_tray(app.handle())?;
            ensure_core_on_setup(app.handle());
            driver_watchdog::start(app.handle());
            spawn_backend_on_setup(app.handle());
            tunnel_manager::sync_tunnel_with_config(app.handle());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building velo-desktop");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            stop_all_managed_processes(app_handle);
        }
    });
}
