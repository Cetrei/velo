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
    BackendReplaceRetrying(u32, String),
    BackendUpdateInstalled(String, String),
    BackendDataDirResolveFailed,
    BackendUninstallFailed(String),
    BackendUninstalled,
    BackendStartupSkippedDisabled,
    BackendKillAttempt(u32),
    BackendKillSucceeded(u32),
    BackendSpawnedWithPid(u32),
    BackendVersionFetchAttempt(String),
    BackendVersionFetchResult(String, String),
    BackendVersionFetchUnreachable(String),
    TunnelSpawnFailed(String),
    TunnelSpawned,
    TunnelKillFailed,
    TunnelBinaryMissing(String),
    TunnelConfigMissing,
    TunnelStartupSkippedUnmanaged,
    TunnelDataDirResolveFailed,
    TunnelReleaseFetchFailed(String),
    TunnelDownloadFailed(String),
    TunnelInstallFailed(String),
    TunnelInstalled(String),
    TunnelVersionWriteFailed(String),
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
            LogMessage::BackendReplaceRetrying(attempt, reason) => {
                format!("[BACKEND_MANAGER] Backend binary still locked by the OS after exit, retrying rename (attempt {attempt}): {reason}")
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
            LogMessage::BackendKillAttempt(pid) => {
                format!("[BACKEND_MANAGER] Killing running backend sidecar, pid={pid}")
            }
            LogMessage::BackendKillSucceeded(pid) => {
                format!("[BACKEND_MANAGER] Backend sidecar pid={pid} confirmed exited")
            }
            LogMessage::BackendSpawnedWithPid(pid) => {
                format!("[BACKEND_MANAGER] New backend sidecar process started, pid={pid}")
            }
            LogMessage::BackendVersionFetchAttempt(url) => {
                format!("[BACKEND_MANAGER] Fetching running backend version from {url}")
            }
            LogMessage::BackendVersionFetchResult(url, version) => {
                format!("[BACKEND_MANAGER] {url} responded with version={version}")
            }
            LogMessage::BackendVersionFetchUnreachable(url) => {
                format!("[BACKEND_MANAGER] {url} did not respond, backend may still be starting or is not running")
            }
            LogMessage::TunnelSpawnFailed(reason) => {
                format!("[TUNNEL_MANAGER] Failed to spawn cloudflared: {reason}")
            }
            LogMessage::TunnelSpawned => {
                "[TUNNEL_MANAGER] cloudflared spawned with the configured tunnel token".to_string()
            }
            LogMessage::TunnelKillFailed => {
                "[TUNNEL_MANAGER] Failed to stop the running cloudflared process".to_string()
            }
            LogMessage::TunnelBinaryMissing(path) => {
                format!("[TUNNEL_MANAGER] cloudflared.exe not found at {path}, cannot start a managed tunnel")
            }
            LogMessage::TunnelConfigMissing => {
                "[TUNNEL_MANAGER] connection.cloudflare_relay missing from user.yml, cannot determine managed tunnel settings".to_string()
            }
            LogMessage::TunnelStartupSkippedUnmanaged => {
                "[TUNNEL_MANAGER] Managed tunnel skipped, connection.cloudflare_relay.managed is false or tunnel_token is empty".to_string()
            }
            LogMessage::TunnelDataDirResolveFailed => {
                "[TUNNEL_MANAGER] Failed to resolve the app data directory for the managed cloudflared binary".to_string()
            }
            LogMessage::TunnelReleaseFetchFailed(reason) => {
                format!("[TUNNEL_MANAGER] Failed to fetch the latest cloudflared release from GitHub: {reason}")
            }
            LogMessage::TunnelDownloadFailed(reason) => {
                format!("[TUNNEL_MANAGER] Failed to download the cloudflared binary: {reason}")
            }
            LogMessage::TunnelInstallFailed(path) => {
                format!("[TUNNEL_MANAGER] Failed to write the downloaded cloudflared binary to {path}")
            }
            LogMessage::TunnelInstalled(version) => {
                format!("[TUNNEL_MANAGER] cloudflared {version} downloaded and installed")
            }
            LogMessage::TunnelVersionWriteFailed(path) => {
                format!("[TUNNEL_MANAGER] Failed to record installed cloudflared version at {path}")
            }
        }
    }
}
