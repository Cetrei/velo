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
    ServerSeedFailed(String),
    ServerSpawnFailed(String),
    ServerSpawned(String),
    ServerKillFailed,
    ServerVersionCheckFailed(String),
    ServerReleaseFetchFailed(String),
    ServerDownloadFailed(String),
    ServerReplaceFailed(String),
    ServerReplaceRetrying(u32, String),
    ServerUpdateInstalled(String, String),
    ServerUpdateRolledBack(String),
    ServerUpdateCancelled,
    ServerDataDirResolveFailed,
    ServerUninstallFailed(String),
    ServerUninstallRetrying(u32, String),
    ServerUninstalled,
    ServerStartupSkippedDisabled,
    ServerKillAttempt(u32),
    ServerKillSucceeded(u32),
    ServerSpawnedWithPid(u32),
    ServerVersionFetchAttempt(String),
    ServerVersionFetchResult(String, String),
    ServerVersionFetchUnreachable(String),
    ServerOrphanKillSucceeded,
    ServerOrphanKillNoneFound,
    ServerOrphanKillFailed(String),
    ServerVersionUrlUnresolved(String),
    ServerVersionHttpClientBuildFailed(String),
    ServerVersionNonSuccessStatus(String, String),
    ServerVersionBodyUnreadable(String, String),
    ServerVersionUnexpectedShape(String, String, String),
    ServerVersionIsDevFallback(String),
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
            LogMessage::ServerSeedFailed(path) => {
                format!("[SERVER_MANAGER] Failed to seed writable backend binary at {path}")
            }
            LogMessage::ServerSpawnFailed(reason) => {
                format!("[SERVER_MANAGER] Failed to spawn backend sidecar: {reason}")
            }
            LogMessage::ServerSpawned(path) => {
                format!("[SERVER_MANAGER] Backend sidecar spawned from {path}")
            }
            LogMessage::ServerKillFailed => {
                "[SERVER_MANAGER] Failed to kill the running backend sidecar before replacing its binary".to_string()
            }
            LogMessage::ServerVersionCheckFailed(reason) => {
                format!("[SERVER_MANAGER] Failed to read running backend version: {reason}")
            }
            LogMessage::ServerReleaseFetchFailed(reason) => {
                format!("[SERVER_MANAGER] Failed to fetch latest backend-v* release from GitHub: {reason}")
            }
            LogMessage::ServerDownloadFailed(reason) => {
                format!("[SERVER_MANAGER] Failed to download new backend binary: {reason}")
            }
            LogMessage::ServerReplaceFailed(reason) => {
                format!("[SERVER_MANAGER] Failed to replace backend binary on disk: {reason}")
            }
            LogMessage::ServerReplaceRetrying(attempt, reason) => {
                format!("[SERVER_MANAGER] Backend binary still locked by the OS after exit, retrying rename (attempt {attempt}): {reason}")
            }
            LogMessage::ServerUpdateInstalled(from, to) => {
                format!("[SERVER_MANAGER] Backend updated from {from} to {to} and restarted")
            }
            LogMessage::ServerUpdateRolledBack(reason) => {
                format!("[SERVER_MANAGER] Backend update failed and was rolled back to the previous binary: {reason}")
            }
            LogMessage::ServerUpdateCancelled => {
                "[SERVER_MANAGER] Backend update cancelled by user request".to_string()
            }
            LogMessage::ServerDataDirResolveFailed => {
                "[SERVER_MANAGER] Failed to resolve the app data directory for the writable backend binary".to_string()
            }
            LogMessage::ServerUninstallFailed(reason) => {
                format!("[SERVER_MANAGER] Failed to remove backend binary and data directory: {reason}")
            }
            LogMessage::ServerUninstallRetrying(attempt, reason) => {
                format!("[SERVER_MANAGER] Backend directory still locked by the OS after exit, retrying removal (attempt {attempt}): {reason}")
            }
            LogMessage::ServerUninstalled => {
                "[SERVER_MANAGER] Backend uninstalled, binary and data directory removed".to_string()
            }
            LogMessage::ServerStartupSkippedDisabled => {
                "[SERVER_MANAGER] Backend autostart skipped, disabled in user.yml (server.enabled = false)".to_string()
            }
            LogMessage::ServerKillAttempt(pid) => {
                format!("[SERVER_MANAGER] Killing running backend sidecar, pid={pid}")
            }
            LogMessage::ServerKillSucceeded(pid) => {
                format!("[SERVER_MANAGER] Backend sidecar pid={pid} confirmed exited")
            }
            LogMessage::ServerSpawnedWithPid(pid) => {
                format!("[SERVER_MANAGER] New backend sidecar process started, pid={pid}")
            }
            LogMessage::ServerVersionFetchAttempt(url) => {
                format!("[SERVER_MANAGER] Fetching running backend version from {url}")
            }
            LogMessage::ServerVersionFetchResult(url, version) => {
                format!("[SERVER_MANAGER] {url} responded with version={version}")
            }
            LogMessage::ServerVersionFetchUnreachable(url) => {
                format!("[SERVER_MANAGER] {url} did not respond, backend may still be starting or is not running")
            }
            LogMessage::ServerOrphanKillSucceeded => {
                "[SERVER_MANAGER] taskkill found and terminated a running backend sidecar not tracked by this app instance".to_string()
            }
            LogMessage::ServerOrphanKillNoneFound => {
                "[SERVER_MANAGER] taskkill found no running backend sidecar process to terminate".to_string()
            }
            LogMessage::ServerOrphanKillFailed(reason) => {
                format!("[SERVER_MANAGER] Failed to run taskkill against the backend sidecar: {reason}")
            }
            LogMessage::ServerVersionUrlUnresolved(reason) => {
                format!("[SERVER_MANAGER] Cannot check running backend version, {reason}")
            }
            LogMessage::ServerVersionHttpClientBuildFailed(reason) => {
                format!("[SERVER_MANAGER] Failed to build HTTP client for version check: {reason}")
            }
            LogMessage::ServerVersionNonSuccessStatus(url, status) => {
                format!("[SERVER_MANAGER] {url} responded with non-success HTTP status {status}, treating backend as not running")
            }
            LogMessage::ServerVersionBodyUnreadable(url, reason) => {
                format!("[SERVER_MANAGER] {url} response body could not be read: {reason}")
            }
            LogMessage::ServerVersionUnexpectedShape(url, reason, raw_body) => {
                format!("[SERVER_MANAGER] {url} response was not the expected JSON shape (a {{\"version\": string}} object): {reason}. Raw body: {raw_body}")
            }
            LogMessage::ServerVersionIsDevFallback(url) => {
                format!(
                    "[SERVER_MANAGER] {url} responded with the dev fallback version 0.0.0-dev. This means the running velo-backend.exe was compiled without VELO_BACKEND_VERSION set at build time (check that apps/server/package.json has a real version and that `bun run compile` embeds it)."
                )
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
