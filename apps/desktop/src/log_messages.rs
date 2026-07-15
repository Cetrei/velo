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
    ServerDownloadFailed(String),
    ServerUninstalled,
    ServerStartupSkippedDisabled,
    ModuleNotInstalled(String),
    ModuleFirstRunInstallStarted(String),
    ModuleFirstRunInstallCompleted(String, String),
    ModuleFirstRunInstallFailed(String, String),
    ModuleSpawnFailed(String, String),
    ModuleSpawned(String, String),
    ModuleKillFailed(String),
    ModuleReleaseFetchFailed(String, String),
    ModuleDownloadFailed(String, String),
    ModuleReplaceFailed(String, String),
    ModuleReplaceRetrying(String, u32, String),
    ModuleUpdateInstalled(String, String, String),
    ModuleUpdateRolledBack(String, String),
    ModuleUpdateCancelled(String),
    ModuleDataDirResolveFailed(String),
    ModuleUninstallFailed(String, String),
    ModuleUninstallRetrying(String, u32, String),
    ModuleOrphanKillSucceeded(String),
    ModuleOrphanKillNoneFound(String),
    ModuleOrphanKillFailed(String, String),
    TunnelConfigMissing,
    TunnelStartupSkippedUnmanaged,
    ManifestFetchFailed(String),
    ManifestSignatureInvalid(String),
    ManifestParseFailed(String),
    ManifestSignatureVerified(String),
    ManifestLoaded(String, usize),
    ManifestCacheWriteFailed(String),
    ManifestCacheUsedAfterFetchFailure(String, String),
    ManifestCacheUnavailable,
    ManifestCacheSignatureInvalid(String),
    ModuleNotInManifest(String),
    CoreDataDirResolveFailed,
    CoreLoadFailed(String),
    CoreSymbolMissing(String),
    CoreAbiMismatch(u32, u32),
    CoreNotInstalled,
    CoreLoaded(u32),
    CoreLoadFailedFallingBackToBackup(String),
    CoreRollbackUnavailable(String),
    CoreRolledBackToBackup(String),
    CoreRollbackFailed(String, String),
    CoreNotLoaded,
    CoreWriteFrameFailed(i32),
    CoreWriteFramePanicked,
    DriverClsidReadFailed(String),
    DriverNotRegistered(String),
    DriverRegistrationRestored(String),
    DriverRegistrationLost(String),
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
            LogMessage::ServerDownloadFailed(reason) => {
                format!("[SERVER_MANAGER] Failed to download new backend binary: {reason}")
            }
            LogMessage::ServerUninstalled => {
                "[SERVER_MANAGER] Backend uninstalled, binary and data directory removed".to_string()
            }
            LogMessage::ServerStartupSkippedDisabled => {
                "[SERVER_MANAGER] Backend autostart skipped, disabled in user.yml (server.enabled = false)".to_string()
            }
            LogMessage::ModuleNotInstalled(module_id) => {
                format!("[MODULE_MANAGER] Cannot spawn module '{module_id}', no binary installed at the writable data path yet")
            }
            LogMessage::ModuleFirstRunInstallStarted(module_id) => {
                format!("[MODULE_MANAGER] No binary installed for module '{module_id}', fetching latest release for first-run install")
            }
            LogMessage::ModuleFirstRunInstallCompleted(module_id, version) => {
                format!("[MODULE_MANAGER] First-run install complete for module '{module_id}', version {version} installed and running")
            }
            LogMessage::ModuleFirstRunInstallFailed(module_id, reason) => {
                format!("[MODULE_MANAGER] First-run install failed for module '{module_id}': {reason}")
            }
            LogMessage::ModuleSpawnFailed(module_id, reason) => {
                format!("[MODULE_MANAGER] Failed to spawn module '{module_id}': {reason}")
            }
            LogMessage::ModuleSpawned(module_id, path) => {
                format!("[MODULE_MANAGER] Module '{module_id}' spawned from {path}")
            }
            LogMessage::ModuleKillFailed(module_id) => {
                format!("[MODULE_MANAGER] Failed to kill the running process for module '{module_id}' before replacing its binary")
            }
            LogMessage::ModuleReleaseFetchFailed(module_id, reason) => {
                format!("[MODULE_MANAGER] Failed to fetch latest release for module '{module_id}' from GitHub: {reason}")
            }
            LogMessage::ModuleDownloadFailed(module_id, reason) => {
                format!("[MODULE_MANAGER] Failed to download new binary for module '{module_id}': {reason}")
            }
            LogMessage::ModuleReplaceFailed(module_id, reason) => {
                format!("[MODULE_MANAGER] Failed to replace binary on disk for module '{module_id}': {reason}")
            }
            LogMessage::ModuleReplaceRetrying(module_id, attempt, reason) => {
                format!("[MODULE_MANAGER] Binary for module '{module_id}' still locked by the OS after exit, retrying rename (attempt {attempt}): {reason}")
            }
            LogMessage::ModuleUpdateInstalled(module_id, from, to) => {
                format!("[MODULE_MANAGER] Module '{module_id}' updated from {from} to {to} and restarted")
            }
            LogMessage::ModuleUpdateRolledBack(module_id, reason) => {
                format!("[MODULE_MANAGER] Update for module '{module_id}' failed and was rolled back to the previous binary: {reason}")
            }
            LogMessage::ModuleUpdateCancelled(module_id) => {
                format!("[MODULE_MANAGER] Update cancelled by user request for module '{module_id}'")
            }
            LogMessage::ModuleDataDirResolveFailed(module_id) => {
                format!("[MODULE_MANAGER] Failed to resolve the app data directory for module '{module_id}'")
            }
            LogMessage::ModuleUninstallFailed(module_id, reason) => {
                format!("[MODULE_MANAGER] Failed to remove binary and data directory for module '{module_id}': {reason}")
            }
            LogMessage::ModuleUninstallRetrying(module_id, attempt, reason) => {
                format!("[MODULE_MANAGER] Directory for module '{module_id}' still locked by the OS after exit, retrying removal (attempt {attempt}): {reason}")
            }
            LogMessage::ModuleOrphanKillSucceeded(module_id) => {
                format!("[MODULE_MANAGER] taskkill found and terminated a running process for module '{module_id}' not tracked by this app instance")
            }
            LogMessage::ModuleOrphanKillNoneFound(module_id) => {
                format!("[MODULE_MANAGER] taskkill found no running process to terminate for module '{module_id}'")
            }
            LogMessage::ModuleOrphanKillFailed(module_id, reason) => {
                format!("[MODULE_MANAGER] Failed to run taskkill against module '{module_id}': {reason}")
            }
            LogMessage::TunnelConfigMissing => {
                "[TUNNEL_MANAGER] connection.cloudflare_relay missing from user.yml, cannot determine managed tunnel settings".to_string()
            }
            LogMessage::TunnelStartupSkippedUnmanaged => {
                "[TUNNEL_MANAGER] Managed tunnel skipped, connection.cloudflare_relay.managed is false or tunnel_token is empty".to_string()
            }
            LogMessage::ManifestFetchFailed(reason) => {
                format!("[MANIFEST] Failed to fetch the signed module manifest from the shell's own release: {reason}")
            }
            LogMessage::ManifestSignatureInvalid(reason) => {
                format!("[MANIFEST] Refusing to trust manifest, signature verification failed: {reason}")
            }
            LogMessage::ManifestParseFailed(reason) => {
                format!("[MANIFEST] Manifest signature verified but JSON parsing failed: {reason}")
            }
            LogMessage::ManifestSignatureVerified(tag) => {
                format!("[MANIFEST] Signature verified for manifest from release {tag}")
            }
            LogMessage::ManifestLoaded(tag, module_count) => {
                format!("[MANIFEST] Loaded {module_count} module entries from release {tag}'s manifest")
            }
            LogMessage::ManifestCacheWriteFailed(reason) => {
                format!("[MANIFEST] Verified manifest fetched successfully but failed to write disk cache, next offline startup will not have a fallback: {reason}")
            }
            LogMessage::ManifestCacheUsedAfterFetchFailure(tag, fetch_error) => {
                format!("[MANIFEST] Network fetch failed ({fetch_error}), falling back to last verified manifest cached from release {tag}")
            }
            LogMessage::ManifestCacheUnavailable => {
                "[MANIFEST] Network fetch failed and no verified manifest cache exists on disk yet, modules cannot be resolved this startup".to_string()
            }
            LogMessage::ManifestCacheSignatureInvalid(reason) => {
                format!("[MANIFEST] Cached manifest on disk failed signature re-verification, refusing to trust it: {reason}")
            }
            LogMessage::ModuleNotInManifest(module_id) => {
                format!("[MANIFEST] Verified manifest does not contain an entry for module '{module_id}'")
            }
            LogMessage::CoreDataDirResolveFailed => {
                "[CORE_LOADER] Failed to resolve the app data directory for Velo-Core".to_string()
            }
            LogMessage::CoreLoadFailed(reason) => {
                format!("[CORE_LOADER] Failed to load the Velo-Core dynamic library: {reason}")
            }
            LogMessage::CoreSymbolMissing(reason) => {
                format!("[CORE_LOADER] Velo-Core dynamic library is missing an expected exported symbol: {reason}")
            }
            LogMessage::CoreAbiMismatch(expected, actual) => {
                format!("[CORE_LOADER] Refusing to load Velo-Core, ABI version mismatch: shell expects {expected}, library exports {actual}")
            }
            LogMessage::CoreNotInstalled => {
                "[CORE_LOADER] No Velo-Core binary installed yet, push_frame will fail until one is installed".to_string()
            }
            LogMessage::CoreLoaded(abi_version) => {
                format!("[CORE_LOADER] Velo-Core loaded successfully, ABI version {abi_version}")
            }
            LogMessage::CoreLoadFailedFallingBackToBackup(reason) => {
                format!("[CORE_LOADER] Failed to load the installed Velo-Core binary ({reason}), attempting to roll back to the previous backup")
            }
            LogMessage::CoreRollbackUnavailable(primary_reason) => {
                format!("[CORE_LOADER] Velo-Core failed to load ({primary_reason}) and no backup binary exists to roll back to, push_frame will fail until a working Core is installed")
            }
            LogMessage::CoreRolledBackToBackup(primary_reason) => {
                format!("[CORE_LOADER] Velo-Core failed to load ({primary_reason}), rolled back to the previous backup binary successfully")
            }
            LogMessage::CoreRollbackFailed(primary_reason, backup_reason) => {
                format!("[CORE_LOADER] Velo-Core failed to load ({primary_reason}) and the backup binary also failed to load ({backup_reason}), push_frame will fail until a working Core is installed")
            }
            LogMessage::CoreNotLoaded => {
                "[CORE_LOADER] push_frame called but no Velo-Core is currently loaded".to_string()
            }
            LogMessage::CoreWriteFrameFailed(code) => {
                format!("[CORE_LOADER] Velo-Core returned error code {code} from velo_core_write_frame")
            }
            LogMessage::CoreWriteFramePanicked => {
                "[CORE_LOADER] Velo-Core panicked inside velo_core_write_frame, caught at the FFI boundary before it could take down the shell".to_string()
            }
            LogMessage::DriverClsidReadFailed(reason) => {
                format!("[DRIVER_WATCHDOG] Failed to read driver.windows_com_clsid from system.yml: {reason}")
            }
            LogMessage::DriverNotRegistered(clsid) => {
                format!("[DRIVER_WATCHDOG] Virtual camera filter {clsid} is not registered in the Windows registry, frames will be marked unavailable until it is")
            }
            LogMessage::DriverRegistrationRestored(clsid) => {
                format!("[DRIVER_WATCHDOG] Virtual camera filter {clsid} is registered again, resuming normal frame delivery")
            }
            LogMessage::DriverRegistrationLost(clsid) => {
                format!("[DRIVER_WATCHDOG] Virtual camera filter {clsid} was registered but is no longer found in the registry, likely an uninstall or a corrupted install")
            }
        }
    }
}
