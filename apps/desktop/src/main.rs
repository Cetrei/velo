#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod log_messages;
mod tray;

use log_messages::LogMessage;
use std::time::Duration;
use tauri::{Manager, WindowEvent};

#[tauri::command]
fn push_frame(bytes: Vec<u8>, width: u32, height: u32) -> Result<(), String> {
    vcam_driver::write_frame_buffer(&bytes, width, height)
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
    config::save_user_config(&app, new_config)
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

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            focus_existing_window(app);
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            push_frame,
            get_system_config,
            get_user_config,
            save_user_config,
            close_splashscreen
        ])
        .setup(|app| {
            create_main_window(app.handle())?;
            tray::create_tray(app.handle())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running velo-desktop");
}
