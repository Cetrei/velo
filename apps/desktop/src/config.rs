use crate::log_messages::LogMessage;
use std::fs;

const USER_CONFIG_PATH: &str = "../../config/user.yml";

fn read_yaml_file(path: &str, error_context: LogMessage) -> Result<String, String> {
    fs::read_to_string(path).map_err(|_| error_context.text())
}

fn parse_yaml(content: &str, error_context: LogMessage) -> Result<serde_yaml::Value, String> {
    serde_yaml::from_str(content).map_err(|_| error_context.text())
}

pub fn get_user_config() -> Result<serde_yaml::Value, String> {
    let content = read_yaml_file(
        USER_CONFIG_PATH,
        LogMessage::ConfigReadFailed(USER_CONFIG_PATH.to_string()),
    )?;
    parse_yaml(
        &content,
        LogMessage::ConfigParseFailed(USER_CONFIG_PATH.to_string()),
    )
}

pub fn save_user_config(new_config: serde_yaml::Value) -> Result<(), String> {
    let serialized = serde_yaml::to_string(&new_config)
        .map_err(|_| LogMessage::ConfigSerializeFailed(USER_CONFIG_PATH.to_string()).text())?;

    fs::write(USER_CONFIG_PATH, serialized)
        .map_err(|_| LogMessage::ConfigWriteFailed(USER_CONFIG_PATH.to_string()).text())
}
