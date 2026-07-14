use crate::log_messages::LogMessage;
use crate::tunnel_manager;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager};

const MENU_ID_OPEN: &str = "open";
const MENU_ID_SETTINGS: &str = "settings";
const MENU_ID_RESTART: &str = "restart";
const MENU_ID_QUIT: &str = "quit";

fn show_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    crate::force_close_splashscreen_if_open(app);
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}

fn emit_open_settings(app: &AppHandle) {
    show_main_window(app);
    let _ = app.emit_to("main", "velo://open-settings", ());
}

fn build_tray_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let open_item = MenuItem::with_id(app, MENU_ID_OPEN, "Open Velo", true, None::<&str>)?;
    let settings_item = MenuItem::with_id(app, MENU_ID_SETTINGS, "Settings", true, None::<&str>)?;
    let restart_item = MenuItem::with_id(app, MENU_ID_RESTART, "Restart", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, MENU_ID_QUIT, "Quit", true, None::<&str>)?;
    Menu::with_items(app, &[&open_item, &settings_item, &restart_item, &quit_item])
}

fn stop_backend_before_exit(app: &AppHandle) {
    crate::server_manager::stop_backend_before_exit(app);
    tunnel_manager::stop_tunnel_before_exit(app);
}

fn handle_menu_event(app: &AppHandle, menu_id: &str) {
    match menu_id {
        MENU_ID_OPEN => show_main_window(app),
        MENU_ID_SETTINGS => emit_open_settings(app),
        MENU_ID_RESTART => app.restart(),
        MENU_ID_QUIT => {
            stop_backend_before_exit(app);
            app.exit(0);
        }
        _ => println!("{}", LogMessage::UnknownTrayMenuId(menu_id.to_string()).text()),
    }
}

pub fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_tray_menu(app)?;
    TrayIconBuilder::with_id("velo-tray")
        .tooltip("Velo")
        .icon(app.default_window_icon().cloned().expect("missing default window icon"))
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| handle_menu_event(app, event.id.as_ref()))
        .build(app)?;
    Ok(())
}
