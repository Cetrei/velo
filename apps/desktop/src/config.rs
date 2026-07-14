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
    let mut config = parse_yaml(&content, LogMessage::ConfigParseFailed(display_path))?;
    migrate_backend_enabled_to_server(&mut config);
    Ok(config)
}

/// Reads the legacy `backend.enabled` key as a fallback when `server.enabled`
/// is absent, so installs updating from a pre-rename build do not have their
/// autostart preference silently reset to the default. Only applied at read
/// time; the file on disk is left untouched until the user's next explicit
/// save. Remove this fallback in a later cleanup pass once confident nobody
/// is on the old key.
fn migrate_backend_enabled_to_server(config: &mut serde_yaml::Value) {
    let Some(mapping) = config.as_mapping_mut() else {
        return;
    };

    let server_key = serde_yaml::Value::String("server".to_string());
    if mapping.contains_key(&server_key) {
        return;
    }

    let legacy_enabled = mapping
        .get(serde_yaml::Value::String("backend".to_string()))
        .and_then(|backend| backend.get("enabled"))
        .and_then(|value| value.as_bool());

    let Some(legacy_enabled) = legacy_enabled else {
        return;
    };

    let mut server_mapping = serde_yaml::Mapping::new();
    server_mapping.insert(serde_yaml::Value::String("enabled".to_string()), serde_yaml::Value::Bool(legacy_enabled));
    mapping.insert(server_key, serde_yaml::Value::Mapping(server_mapping));
}

pub fn save_user_config(app: &AppHandle, new_config: serde_yaml::Value) -> Result<(), String> {
    let writable_path = resolve_writable_user_config_path(app)?;
    let display_path = writable_path.display().to_string();

    let serialized = serde_yaml::to_string(&new_config)
        .map_err(|_| LogMessage::ConfigSerializeFailed(display_path.clone()).text())?;

    fs::write(&writable_path, serialized)
        .map_err(|_| LogMessage::ConfigWriteFailed(display_path).text())
}
