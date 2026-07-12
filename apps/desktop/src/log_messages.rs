pub enum LogMessage {
    ConfigReadFailed(String),
    ConfigParseFailed(String),
    ConfigWriteFailed(String),
    ConfigSerializeFailed(String),
    DuplicateInstanceBlocked,
    PagesUrlInvalid(String),
    ConfigResourceResolveFailed(String),
    ConfigAppDirResolveFailed,
    ConfigSeedFailed(String),
    UnknownTrayMenuId(String),
    WindowHiddenToTray,
    MainWindowMissing,
    MainWindowShowFailed,
    CloseSplashscreenInvoked,
    SplashscreenWindowMissing,
    SplashscreenClosedFromMainShow,
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
            LogMessage::DuplicateInstanceBlocked => {
                "[DESKTOP] Duplicate instance launch blocked, focused existing window".to_string()
            }
            LogMessage::PagesUrlInvalid(url) => {
                format!("[DESKTOP] VELO_PAGES_URL is not a valid URL: {url}")
            }
            LogMessage::ConfigResourceResolveFailed(name) => {
                format!("[DESKTOP] Failed to resolve bundled resource path for {name}")
            }
            LogMessage::ConfigAppDirResolveFailed => {
                "[DESKTOP] Failed to resolve the app config directory".to_string()
            }
            LogMessage::ConfigSeedFailed(path) => {
                format!("[DESKTOP] Failed to seed writable user config at {path}")
            }
            LogMessage::UnknownTrayMenuId(id) => {
                format!("[DESKTOP] Received unknown tray menu id: {id}")
            }
            LogMessage::WindowHiddenToTray => {
                "[DESKTOP] Main window hidden to tray on close request".to_string()
            }
            LogMessage::MainWindowMissing => {
                "[DESKTOP] Main window not found when attempting to close splashscreen".to_string()
            }
            LogMessage::MainWindowShowFailed => {
                "[DESKTOP] Failed to show main window after splashscreen".to_string()
            }
            LogMessage::CloseSplashscreenInvoked => {
                "[DESKTOP] close_splashscreen invoked from frontend".to_string()
            }
            LogMessage::SplashscreenWindowMissing => {
                "[DESKTOP] splashscreen window not found, likely already closed".to_string()
            }
            LogMessage::SplashscreenClosedFromMainShow => {
                "[DESKTOP] splashscreen force-closed as a fallback when main window was shown via tray or duplicate-instance focus".to_string()
            }
        }
    }
}
