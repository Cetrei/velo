pub enum LogMessage {
    ConfigReadFailed(String),
    ConfigParseFailed(String),
    ConfigWriteFailed(String),
    ConfigSerializeFailed(String),
}

impl LogMessage {
    pub fn text(&self) -> String {
        match self {
            LogMessage::ConfigReadFailed(path) => {
                format!("[DESKTOP] Failed to read config file at {path}")
            }
            LogMessage::ConfigParseFailed(path) => {
                format!("[DESKTOP] Failed to parse YAML config at {path}")
            }
            LogMessage::ConfigWriteFailed(path) => {
                format!("[DESKTOP] Failed to write config file at {path}")
            }
            LogMessage::ConfigSerializeFailed(path) => {
                format!("[DESKTOP] Failed to serialize config for {path}")
            }
        }
    }
}
