use crate::log_messages::LogMessage;
use std::fs;
use std::path::PathBuf;
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};

const SYSTEM_CONFIG_RESOURCE: &str = "config/system.yml";
const USER_CONFIG_RESOURCE: &str = "config/user.yml";
const USER_CONFIG_FILENAME: &str = "user.yml";

fn read_yaml_file(path: &PathBuf, error_context: LogMessage) -> Result<String, String> {
    fs::read_to_string(path).map_err(|_| error_context.text())
}

fn parse_yaml(content: &str, error_context: LogMessage) -> Result<serde_yaml::Value, String> {
    serde_yaml::from_str(content).map_err(|_| error_context.text())
}

fn resolve_bundled_resource(app: &AppHandle, resource: &str) -> Result<PathBuf, String> {
    app.path()
        .resolve(resource, BaseDirectory::Resource)
        .map_err(|_| LogMessage::ConfigResourceResolveFailed(resource.to_string()).text())
}

fn resolve_writable_user_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|_| LogMessage::ConfigAppDirResolveFailed.text())?;
    Ok(config_dir.join(USER_CONFIG_FILENAME))
}

fn seed_user_config_if_missing(app: &AppHandle, writable_path: &PathBuf) -> Result<(), String> {
    if writable_path.exists() {
        return Ok(());
    }

    let config_dir = writable_path
        .parent()
        .ok_or_else(|| LogMessage::ConfigAppDirResolveFailed.text())?;
    fs::create_dir_all(config_dir)
        .map_err(|_| LogMessage::ConfigSeedFailed(writable_path.display().to_string()).text())?;

    let bundled_default = resolve_bundled_resource(app, USER_CONFIG_RESOURCE)?;
    fs::copy(&bundled_default, writable_path)
        .map_err(|_| LogMessage::ConfigSeedFailed(writable_path.display().to_string()).text())?;
    Ok(())
}

pub fn get_system_config(app: &AppHandle) -> Result<serde_yaml::Value, String> {
    let path = resolve_bundled_resource(app, SYSTEM_CONFIG_RESOURCE)?;
    let content = read_yaml_file(&path, LogMessage::ConfigReadFailed(SYSTEM_CONFIG_RESOURCE.to_string()))?;
    parse_yaml(&content, LogMessage::ConfigParseFailed(SYSTEM_CONFIG_RESOURCE.to_string()))
}

pub fn get_user_config(app: &AppHandle) -> Result<serde_yaml::Value, String> {
    let writable_path = resolve_writable_user_config_path(app)?;
    seed_user_config_if_missing(app, &writable_path)?;

    let display_path = writable_path.display().to_string();
    let content = read_yaml_file(&writable_path, LogMessage::ConfigReadFailed(display_path.clone()))?;
    parse_yaml(&content, LogMessage::ConfigParseFailed(display_path))
}

pub fn save_user_config(app: &AppHandle, new_config: serde_yaml::Value) -> Result<(), String> {
    let writable_path = resolve_writable_user_config_path(app)?;
    let display_path = writable_path.display().to_string();

    let serialized = serde_yaml::to_string(&new_config)
        .map_err(|_| LogMessage::ConfigSerializeFailed(display_path.clone()).text())?;

    fs::write(&writable_path, serialized)
        .map_err(|_| LogMessage::ConfigWriteFailed(display_path).text())
}
