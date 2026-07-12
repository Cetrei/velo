mod config;
mod log_messages;

#[tauri::command]
fn push_frame(bytes: Vec<u8>, width: u32, height: u32) -> Result<(), String> {
    vcam_driver::write_frame_buffer(&bytes, width, height)
}

#[tauri::command]
fn get_user_config() -> Result<serde_yaml::Value, String> {
    config::get_user_config()
}

#[tauri::command]
fn save_user_config(new_config: serde_yaml::Value) -> Result<(), String> {
    config::save_user_config(new_config)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            push_frame,
            get_user_config,
            save_user_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running velo-desktop");
}
