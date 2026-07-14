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
    BackendSeedFailed(String),
    BackendSpawnFailed(String),
    BackendSpawned(String),
    BackendKillFailed,
    BackendVersionCheckFailed(String),
    BackendReleaseFetchFailed(String),
    BackendDownloadFailed(String),
    BackendReplaceFailed(String),
    BackendUpdateInstalled(String, String),
    BackendDataDirResolveFailed,
    BackendUninstallFailed(String),
    BackendUninstalled,
    BackendStartupSkippedDisabled,
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
            LogMessage::BackendSeedFailed(path) => {
                format!("[BACKEND_MANAGER] Failed to seed writable backend binary at {path}")
            }
            LogMessage::BackendSpawnFailed(reason) => {
                format!("[BACKEND_MANAGER] Failed to spawn backend sidecar: {reason}")
            }
            LogMessage::BackendSpawned(path) => {
                format!("[BACKEND_MANAGER] Backend sidecar spawned from {path}")
            }
            LogMessage::BackendKillFailed => {
                "[BACKEND_MANAGER] Failed to kill the running backend sidecar before replacing its binary".to_string()
            }
            LogMessage::BackendVersionCheckFailed(reason) => {
                format!("[BACKEND_MANAGER] Failed to read running backend version: {reason}")
            }
            LogMessage::BackendReleaseFetchFailed(reason) => {
                format!("[BACKEND_MANAGER] Failed to fetch latest backend-v* release from GitHub: {reason}")
            }
            LogMessage::BackendDownloadFailed(reason) => {
                format!("[BACKEND_MANAGER] Failed to download new backend binary: {reason}")
            }
            LogMessage::BackendReplaceFailed(reason) => {
                format!("[BACKEND_MANAGER] Failed to replace backend binary on disk: {reason}")
            }
            LogMessage::BackendUpdateInstalled(from, to) => {
                format!("[BACKEND_MANAGER] Backend updated from {from} to {to} and restarted")
            }
            LogMessage::BackendDataDirResolveFailed => {
                "[BACKEND_MANAGER] Failed to resolve the app data directory for the writable backend binary".to_string()
            }
            LogMessage::BackendUninstallFailed(reason) => {
                format!("[BACKEND_MANAGER] Failed to remove backend binary and data directory: {reason}")
            }
            LogMessage::BackendUninstalled => {
                "[BACKEND_MANAGER] Backend uninstalled, binary and data directory removed".to_string()
            }
            LogMessage::BackendStartupSkippedDisabled => {
                "[BACKEND_MANAGER] Backend autostart skipped, disabled in user.yml (backend.enabled = false)".to_string()
            }
        }
    }
}
