use crate::log_messages::LogMessage;
use crate::update_progress::{
    download_with_progress, emit_progress, request_timeout, CancellationToken, DownloadError, UpdateProgress, BACKEND_UPDATE_PROGRESS_EVENT,
};
use serde::{Deserialize, Serialize};
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Child;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager};

const BACKEND_BINARY_FILENAME: &str = "velo-backend.exe";
const BACKEND_BACKUP_FILENAME: &str = "velo-backend.exe.backup";
const BACKEND_PARTIAL_FILENAME: &str = "velo-backend.exe.partial";
const GITHUB_API_ACCEPT_HEADER: &str = "application/vnd.github+json";
const GITHUB_USER_AGENT: &str = "velo-desktop-backend-manager";
const BACKEND_TAG_PREFIX: &str = "backend-v";
const CREATE_NO_WINDOW: u32 = 0x08000000;
const BACKEND_REPLACE_MAX_ATTEMPTS: u32 = 5;
const BACKEND_REPLACE_RETRY_BASE_DELAY_MS: u64 = 200;
const BACKEND_POST_INSTALL_HEALTHCHECK_ATTEMPTS: u32 = 10;
const BACKEND_POST_INSTALL_HEALTHCHECK_DELAY_MS: u64 = 300;

pub struct BackendState(pub Mutex<Option<Child>>);
pub struct BackendUpdateCancellation(pub Mutex<Option<CancellationToken>>);

#[derive(Serialize)]
pub struct BackendStatus {
    running: bool,
    installed: bool,
    version: Option<String>,
}

#[derive(Serialize)]
pub struct BackendUpdateInfo {
    available: bool,
    current_version: Option<String>,
    latest_version: Option<String>,
}

#[derive(Deserialize)]
struct LocalVersionResponse {
    version: String,
}

#[derive(Deserialize)]
struct GithubReleaseAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Deserialize)]
struct GithubRelease {
    tag_name: String,
    draft: bool,
    prerelease: bool,
    assets: Vec<GithubReleaseAsset>,
}

fn resolve_backend_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| LogMessage::BackendDataDirResolveFailed.text())?;
    Ok(data_dir.join("backend"))
}

fn resolve_writable_backend_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(resolve_backend_dir(app)?.join(BACKEND_BINARY_FILENAME))
}

fn resolve_backup_backend_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(resolve_backend_dir(app)?.join(BACKEND_BACKUP_FILENAME))
}

fn resolve_partial_download_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(resolve_backend_dir(app)?.join(BACKEND_PARTIAL_FILENAME))
}

fn resolve_bundled_sidecar_path() -> Result<PathBuf, String> {
    let executable_path = std::env::current_exe()
        .map_err(|_| LogMessage::BackendSeedFailed("could not resolve current executable path".to_string()).text())?;
    let install_dir = executable_path
        .parent()
        .ok_or_else(|| LogMessage::BackendSeedFailed("could not resolve install directory".to_string()).text())?;
    Ok(install_dir.join(BACKEND_BINARY_FILENAME))
}

fn seed_backend_binary_if_missing(_app: &AppHandle, writable_path: &PathBuf) -> Result<(), String> {
    if writable_path.exists() {
        return Ok(());
    }

    let parent = writable_path
        .parent()
        .ok_or_else(|| LogMessage::BackendDataDirResolveFailed.text())?;
    std::fs::create_dir_all(parent)
        .map_err(|_| LogMessage::BackendSeedFailed(writable_path.display().to_string()).text())?;

    let bundled_sidecar = resolve_bundled_sidecar_path()?;
    std::fs::copy(&bundled_sidecar, writable_path)
        .map_err(|_| LogMessage::BackendSeedFailed(writable_path.display().to_string()).text())?;
    Ok(())
}

fn resolve_bundled_config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .resolve("config", tauri::path::BaseDirectory::Resource)
        .map_err(|_| LogMessage::BackendSpawnFailed("could not resolve bundled config directory".to_string()).text())
}

pub fn spawn_backend(app: &AppHandle) -> Result<(), String> {
    let writable_path = resolve_writable_backend_path(app)?;
    seed_backend_binary_if_missing(app, &writable_path)?;
    let config_dir = resolve_bundled_config_dir(app)?;

    let child = std::process::Command::new(&writable_path)
        .env("VELO_CONFIG_DIR", config_dir)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|error| LogMessage::BackendSpawnFailed(error.to_string()).text())?;

    println!("{}", LogMessage::BackendSpawned(writable_path.display().to_string()).text());
    println!("{}", LogMessage::BackendSpawnedWithPid(child.id()).text());
    app.state::<BackendState>().0.lock().unwrap().replace(child);
    Ok(())
}

pub fn stop_backend_before_exit(app: &AppHandle) {
    if let Some(mut child) = app.state::<BackendState>().0.lock().unwrap().take() {
        let _ = child.kill();
    }
}

fn kill_running_backend(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<BackendState>();
    let mut guard = state.0.lock().unwrap();
    let Some(mut child) = guard.take() else {
        return Ok(());
    };
    let pid = child.id();
    println!("{}", LogMessage::BackendKillAttempt(pid).text());
    child.kill().map_err(|_| LogMessage::BackendKillFailed.text())?;
    child.wait().map_err(|_| LogMessage::BackendKillFailed.text())?;
    println!("{}", LogMessage::BackendKillSucceeded(pid).text());
    Ok(())
}

fn kill_orphaned_backend_processes_by_name() {
    let result = std::process::Command::new("taskkill")
        .args(["/IM", BACKEND_BINARY_FILENAME, "/F"])
        .creation_flags(CREATE_NO_WINDOW)
        .output();

    match result {
        Ok(output) if output.status.success() => {
            println!("{}", LogMessage::BackendOrphanKillSucceeded.text());
        }
        Ok(_) => {
            println!("{}", LogMessage::BackendOrphanKillNoneFound.text());
        }
        Err(error) => {
            println!("{}", LogMessage::BackendOrphanKillFailed(error.to_string()).text());
        }
    }
}

fn is_backend_installed(app: &AppHandle) -> bool {
    resolve_writable_backend_path(app)
        .map(|path| path.exists())
        .unwrap_or(false)
}

fn resolve_local_version_url(app: &AppHandle) -> Result<String, String> {
    let system_config = crate::config::get_system_config(app)?;
    let port = system_config
        .get("network")
        .and_then(|network| network.get("signaling_port"))
        .and_then(|value| value.as_u64())
        .ok_or_else(|| LogMessage::BackendVersionCheckFailed("network.signaling_port missing from system.yml".to_string()).text())?;
    Ok(format!("http://127.0.0.1:{port}/version"))
}

fn resolve_releases_repo(app: &AppHandle) -> Result<String, String> {
    let system_config = crate::config::get_system_config(app)?;
    system_config
        .get("releases")
        .and_then(|releases| releases.get("repo"))
        .and_then(|value| value.as_str())
        .map(|repo| repo.to_string())
        .ok_or_else(|| LogMessage::BackendReleaseFetchFailed("releases.repo missing from system.yml".to_string()).text())
}

async fn fetch_running_backend_version(app: &AppHandle) -> Option<String> {
    let url = match resolve_local_version_url(app) {
        Ok(url) => url,
        Err(reason) => {
            println!("{}", LogMessage::BackendVersionUrlUnresolved(reason).text());
            return None;
        }
    };
    println!("{}", LogMessage::BackendVersionFetchAttempt(url.clone()).text());

    let client = match reqwest::Client::builder().timeout(request_timeout()).build() {
        Ok(client) => client,
        Err(error) => {
            println!("{}", LogMessage::BackendVersionHttpClientBuildFailed(error.to_string()).text());
            return None;
        }
    };

    let response = match client.get(&url).send().await {
        Ok(response) => response,
        Err(error) => {
            println!("{}", LogMessage::BackendVersionFetchUnreachable(format!("{url} ({error})")).text());
            return None;
        }
    };

    if !response.status().is_success() {
        println!("{}", LogMessage::BackendVersionNonSuccessStatus(url, response.status().to_string()).text());
        return None;
    }

    let raw_body = match response.text().await {
        Ok(body) => body,
        Err(error) => {
            println!("{}", LogMessage::BackendVersionBodyUnreadable(url, error.to_string()).text());
            return None;
        }
    };

    let parsed: LocalVersionResponse = match serde_json::from_str(&raw_body) {
        Ok(parsed) => parsed,
        Err(error) => {
            println!("{}", LogMessage::BackendVersionUnexpectedShape(url, error.to_string(), raw_body).text());
            return None;
        }
    };

    if parsed.version == "0.0.0-dev" {
        println!("{}", LogMessage::BackendVersionIsDevFallback(url.clone()).text());
    }

    println!("{}", LogMessage::BackendVersionFetchResult(url, parsed.version.clone()).text());
    Some(parsed.version)
}

async fn wait_for_backend_healthy(app: &AppHandle) -> bool {
    for _ in 0..BACKEND_POST_INSTALL_HEALTHCHECK_ATTEMPTS {
        if fetch_running_backend_version(app).await.is_some() {
            return true;
        }
        tokio::time::sleep(Duration::from_millis(BACKEND_POST_INSTALL_HEALTHCHECK_DELAY_MS)).await;
    }
    false
}

fn is_windows_backend_asset(name: &str) -> bool {
    name.eq_ignore_ascii_case(BACKEND_BINARY_FILENAME)
}

async fn fetch_latest_backend_release(app: &AppHandle) -> Result<GithubRelease, String> {
    let repo = resolve_releases_repo(app)?;
    let releases_url = format!("https://api.github.com/repos/{repo}/releases");

    let client = reqwest::Client::builder()
        .timeout(request_timeout())
        .build()
        .map_err(|error| LogMessage::BackendReleaseFetchFailed(format!("failed to build HTTP client: {error}")).text())?;
    let response = client
        .get(&releases_url)
        .header("Accept", GITHUB_API_ACCEPT_HEADER)
        .header("User-Agent", GITHUB_USER_AGENT)
        .send()
        .await
        .map_err(|error| LogMessage::BackendReleaseFetchFailed(error.to_string()).text())?;

    if !response.status().is_success() {
        return Err(LogMessage::BackendReleaseFetchFailed(format!(
            "{releases_url} responded with HTTP {}",
            response.status()
        ))
        .text());
    }

    let releases: Vec<GithubRelease> = response
        .json()
        .await
        .map_err(|error| LogMessage::BackendReleaseFetchFailed(error.to_string()).text())?;

    releases
        .into_iter()
        .find(|release| !release.draft && !release.prerelease && release.tag_name.starts_with(BACKEND_TAG_PREFIX))
        .ok_or_else(|| LogMessage::BackendReleaseFetchFailed("no published backend-v* release found".to_string()).text())
}

fn extract_backend_download_url(release: &GithubRelease) -> Result<String, String> {
    release
        .assets
        .iter()
        .find(|asset| is_windows_backend_asset(&asset.name))
        .map(|asset| asset.browser_download_url.clone())
        .ok_or_else(|| LogMessage::BackendReleaseFetchFailed(format!("release {} has no {} asset", release.tag_name, BACKEND_BINARY_FILENAME)).text())
}

fn tag_to_version_name(tag_name: &str) -> String {
    tag_name.trim_start_matches(BACKEND_TAG_PREFIX).to_string()
}

#[tauri::command]
pub async fn get_backend_status(app: AppHandle) -> BackendStatus {
    let version = fetch_running_backend_version(&app).await;
    BackendStatus { running: version.is_some(), installed: is_backend_installed(&app), version }
}

#[tauri::command]
pub fn start_backend(app: AppHandle) -> Result<BackendStatus, String> {
    spawn_backend(&app)?;
    Ok(BackendStatus { running: true, installed: true, version: None })
}

#[tauri::command]
pub fn restart_backend(app: AppHandle) -> Result<BackendStatus, String> {
    kill_running_backend(&app)?;
    spawn_backend(&app)?;
    Ok(BackendStatus { running: true, installed: true, version: None })
}

#[tauri::command]
pub fn stop_backend(app: AppHandle) -> Result<BackendStatus, String> {
    kill_running_backend(&app)?;
    Ok(BackendStatus { running: false, installed: is_backend_installed(&app), version: None })
}

const BACKEND_UNINSTALL_MAX_ATTEMPTS: u32 = 8;
const BACKEND_UNINSTALL_RETRY_BASE_DELAY_MS: u64 = 250;
const BACKEND_UNINSTALL_INITIAL_DELAY_MS: u64 = 250;

/// Retries removing the backend directory a few times before giving up.
/// taskkill returns as soon as it requests process termination, not once
/// Windows has actually released the file handle, so the binary can still
/// be locked for a brief window immediately after the kill call returns.
/// Windows also keeps a just-terminated .exe's image section cached by the
/// memory manager for a short moment after exit, which alone can produce
/// "Access is denied" on the very first delete attempt even though the
/// process is already gone; the fixed initial delay below gives that cache
/// a chance to clear before the first attempt instead of burning it as a
/// wasted, near-instant failure.
fn remove_backend_binary_and_directory(app: &AppHandle) -> Result<(), String> {
    let writable_path = resolve_writable_backend_path(app)?;
    if !writable_path.exists() {
        return Ok(());
    }
    let backend_dir = writable_path
        .parent()
        .ok_or_else(|| LogMessage::BackendDataDirResolveFailed.text())?;

    std::thread::sleep(std::time::Duration::from_millis(BACKEND_UNINSTALL_INITIAL_DELAY_MS));

    let mut last_error = String::new();
    for attempt in 1..=BACKEND_UNINSTALL_MAX_ATTEMPTS {
        match std::fs::remove_dir_all(backend_dir) {
            Ok(()) => return Ok(()),
            Err(error) => {
                last_error = error.to_string();
                println!("{}", LogMessage::BackendUninstallRetrying(attempt, last_error.clone()).text());
                let delay = BACKEND_UNINSTALL_RETRY_BASE_DELAY_MS * attempt as u64;
                std::thread::sleep(std::time::Duration::from_millis(delay));
            }
        }
    }
    Err(LogMessage::BackendUninstallFailed(last_error).text())
}

#[tauri::command]
pub fn uninstall_backend(app: AppHandle) -> Result<BackendStatus, String> {
    kill_running_backend(&app)?;
    kill_orphaned_backend_processes_by_name();
    remove_backend_binary_and_directory(&app)?;
    println!("{}", LogMessage::BackendUninstalled.text());
    Ok(BackendStatus { running: false, installed: false, version: None })
}

#[tauri::command]
pub async fn check_backend_update(app: AppHandle) -> Result<BackendUpdateInfo, String> {
    let current_version = fetch_running_backend_version(&app).await;
    let release = fetch_latest_backend_release(&app).await?;
    let latest_version = tag_to_version_name(&release.tag_name);

    let available = match &current_version {
        Some(current) => current != &latest_version,
        None => true,
    };

    Ok(BackendUpdateInfo { available, current_version, latest_version: Some(latest_version) })
}

fn rename_with_retry(app: &AppHandle, temp_path: &PathBuf, destination_path: &PathBuf, progress_phase: UpdateProgress) -> Result<(), String> {
    let mut last_error = String::new();
    for attempt in 1..=BACKEND_REPLACE_MAX_ATTEMPTS {
        match std::fs::rename(temp_path, destination_path) {
            Ok(()) => return Ok(()),
            Err(error) => {
                last_error = error.to_string();
                println!("{}", LogMessage::BackendReplaceRetrying(attempt, last_error.clone()).text());
                emit_progress(app, BACKEND_UPDATE_PROGRESS_EVENT, progress_phase.clone());
                let delay = BACKEND_REPLACE_RETRY_BASE_DELAY_MS * attempt as u64;
                std::thread::sleep(std::time::Duration::from_millis(delay));
            }
        }
    }
    Err(LogMessage::BackendReplaceFailed(last_error).text())
}

/// Moves the currently installed binary aside into a backup slot instead of
/// deleting it. This is the safety net rollback relies on: nothing that
/// currently works gets destroyed until the new binary has proven itself.
fn backup_current_backend_binary(app: &AppHandle, writable_path: &PathBuf, backup_path: &PathBuf) -> Result<(), String> {
    if !writable_path.exists() {
        return Ok(());
    }
    emit_progress(app, BACKEND_UPDATE_PROGRESS_EVENT, UpdateProgress::BackingUp);
    std::fs::rename(writable_path, backup_path).map_err(|error| LogMessage::BackendReplaceFailed(error.to_string()).text())
}

fn install_new_backend_binary(app: &AppHandle, writable_path: &PathBuf, new_binary: &[u8]) -> Result<(), String> {
    let parent = writable_path
        .parent()
        .ok_or_else(|| LogMessage::BackendDataDirResolveFailed.text())?;
    std::fs::create_dir_all(parent)
        .map_err(|error| LogMessage::BackendReplaceFailed(error.to_string()).text())?;

    let temp_path = writable_path.with_extension("exe.new");
    std::fs::write(&temp_path, new_binary)
        .map_err(|error| LogMessage::BackendReplaceFailed(error.to_string()).text())?;

    emit_progress(app, BACKEND_UPDATE_PROGRESS_EVENT, UpdateProgress::InstallingNew);
    rename_with_retry(app, &temp_path, writable_path, UpdateProgress::InstallingNew)
}

/// Restores the backed-up previous binary and restarts it, used when the
/// freshly installed binary fails to boot or fails its healthcheck. Backend
/// updates must never leave the user without a working backend, so this is
/// attempted even if the failure happened mid-installation.
async fn rollback_to_previous_backend(app: &AppHandle, writable_path: &PathBuf, backup_path: &PathBuf, reason: String) -> String {
    if !backup_path.exists() {
        let message = format!("{reason} (no backup available to roll back to)");
        emit_progress(app, BACKEND_UPDATE_PROGRESS_EVENT, UpdateProgress::Failed { message: message.clone() });
        return message;
    }

    std::fs::remove_file(writable_path).ok();
    if let Err(rename_error) = rename_with_retry(app, backup_path, writable_path, UpdateProgress::BackingUp) {
        let message = format!("{reason} (rollback also failed: {rename_error})");
        emit_progress(app, BACKEND_UPDATE_PROGRESS_EVENT, UpdateProgress::Failed { message: message.clone() });
        return message;
    }

    if spawn_backend(app).is_ok() {
        let message = format!("{reason} (rolled back to previous version)");
        println!("{}", LogMessage::BackendUpdateRolledBack(reason.clone()).text());
        emit_progress(app, BACKEND_UPDATE_PROGRESS_EVENT, UpdateProgress::RolledBack { message: message.clone() });
        return message;
    }

    let message = format!("{reason} (rolled back binary but failed to restart it)");
    emit_progress(app, BACKEND_UPDATE_PROGRESS_EVENT, UpdateProgress::Failed { message: message.clone() });
    message
}

fn take_or_create_cancellation_token(app: &AppHandle) -> CancellationToken {
    let state = app.state::<BackendUpdateCancellation>();
    let mut guard = state.0.lock().unwrap();
    let token = CancellationToken::new();
    guard.replace(token.clone());
    token
}

fn clear_cancellation_token(app: &AppHandle) {
    app.state::<BackendUpdateCancellation>().0.lock().unwrap().take();
}

#[tauri::command]
pub fn cancel_backend_update(app: AppHandle) {
    let state = app.state::<BackendUpdateCancellation>();
    let guard = state.0.lock().unwrap();
    if let Some(token) = guard.as_ref() {
        token.cancel();
    }
}

fn fail_update(app: &AppHandle, error: String) -> String {
    clear_cancellation_token(app);
    emit_progress(app, BACKEND_UPDATE_PROGRESS_EVENT, UpdateProgress::Failed { message: error.clone() });
    error
}

const CANCELLED_ERROR: &str = "cancelled";

/// Ends the update attempt after a cancellation. The `Cancelled` progress
/// event was already emitted where the cancellation was detected, so this
/// only clears the token and returns the sentinel error without emitting a
/// second, contradictory `Failed` event on top of it.
fn cancel_update(app: &AppHandle) -> String {
    clear_cancellation_token(app);
    CANCELLED_ERROR.to_string()
}

async fn download_new_backend_binary(
    app: &AppHandle,
    download_url: &str,
    partial_path: &PathBuf,
    cancellation: &CancellationToken,
) -> Result<Vec<u8>, String> {
    let bytes = download_with_progress(app, BACKEND_UPDATE_PROGRESS_EVENT, download_url, partial_path, cancellation)
        .await
        .map_err(|error| match error {
            DownloadError::Cancelled => {
                println!("{}", LogMessage::BackendUpdateCancelled.text());
                CANCELLED_ERROR.to_string()
            }
            DownloadError::Failed(reason) => LogMessage::BackendDownloadFailed(reason).text(),
        })?;

    emit_progress(app, BACKEND_UPDATE_PROGRESS_EVENT, UpdateProgress::Verifying);
    if bytes.is_empty() {
        return Err(LogMessage::BackendDownloadFailed("downloaded binary is empty".to_string()).text());
    }
    Ok(bytes)
}

async fn replace_and_restart_backend(
    app: &AppHandle,
    writable_path: &PathBuf,
    backup_path: &PathBuf,
    new_binary: &[u8],
) -> Result<(), String> {
    kill_running_backend(app).ok();
    kill_orphaned_backend_processes_by_name();
    backup_current_backend_binary(app, writable_path, backup_path)?;

    if let Err(install_error) = install_new_backend_binary(app, writable_path, new_binary) {
        return Err(rollback_to_previous_backend(app, writable_path, backup_path, install_error).await);
    }

    emit_progress(app, BACKEND_UPDATE_PROGRESS_EVENT, UpdateProgress::Starting);
    if let Err(spawn_error) = spawn_backend(app) {
        return Err(rollback_to_previous_backend(app, writable_path, backup_path, spawn_error).await);
    }

    if !wait_for_backend_healthy(app).await {
        let reason = "new backend binary started but did not respond to its healthcheck".to_string();
        return Err(rollback_to_previous_backend(app, writable_path, backup_path, reason).await);
    }

    std::fs::remove_file(backup_path).ok();
    Ok(())
}

#[tauri::command]
pub async fn install_backend_update(app: AppHandle) -> Result<BackendStatus, String> {
    let cancellation = take_or_create_cancellation_token(&app);
    emit_progress(&app, BACKEND_UPDATE_PROGRESS_EVENT, UpdateProgress::CheckingRelease);

    let previous_version = fetch_running_backend_version(&app).await.unwrap_or_default();
    let release = fetch_latest_backend_release(&app).await.map_err(|error| fail_update(&app, error))?;
    let download_url = extract_backend_download_url(&release).map_err(|error| fail_update(&app, error))?;
    let partial_path = resolve_partial_download_path(&app).map_err(|error| fail_update(&app, error))?;
    let writable_path = resolve_writable_backend_path(&app).map_err(|error| fail_update(&app, error))?;
    let backup_path = resolve_backup_backend_path(&app).map_err(|error| fail_update(&app, error))?;

    let new_binary = match download_new_backend_binary(&app, &download_url, &partial_path, &cancellation).await {
        Ok(bytes) => bytes,
        Err(error) if error == CANCELLED_ERROR => return Err(cancel_update(&app)),
        Err(error) => return Err(fail_update(&app, error)),
    };

    if let Err(error) = replace_and_restart_backend(&app, &writable_path, &backup_path, &new_binary).await {
        clear_cancellation_token(&app);
        return Err(error);
    }

    clear_cancellation_token(&app);
    let latest_version = tag_to_version_name(&release.tag_name);
    println!("{}", LogMessage::BackendUpdateInstalled(previous_version, latest_version.clone()).text());
    emit_progress(&app, BACKEND_UPDATE_PROGRESS_EVENT, UpdateProgress::Done { version: latest_version.clone() });

    Ok(BackendStatus { running: true, installed: true, version: Some(latest_version) })
}

const DEV_SIDELOAD_MIN_SIZE_BYTES: usize = 1024;

/// Installs a backend binary supplied directly by the developer from the
/// Console tab, bypassing the GitHub Releases lookup entirely. This exists
/// for local iteration: a freshly `bun run build:server`-compiled exe often
/// has no matching `backend-v*` GitHub release yet, so the normal update
/// path has nothing to check against. Reuses the same backup, install,
/// restart, and healthcheck-gated rollback sequence as a real update so a
/// bad manual build can't brick the installed backend either.
#[tauri::command]
pub async fn install_backend_from_bytes(app: AppHandle, bytes: Vec<u8>) -> Result<BackendStatus, String> {
    if bytes.len() < DEV_SIDELOAD_MIN_SIZE_BYTES {
        return Err(LogMessage::BackendDownloadFailed("selected file is too small to be a real backend binary".to_string()).text());
    }

    emit_progress(&app, BACKEND_UPDATE_PROGRESS_EVENT, UpdateProgress::Verifying);
    let previous_version = fetch_running_backend_version(&app).await.unwrap_or_default();
    let writable_path = resolve_writable_backend_path(&app).map_err(|error| fail_update(&app, error))?;
    let backup_path = resolve_backup_backend_path(&app).map_err(|error| fail_update(&app, error))?;

    if let Err(error) = replace_and_restart_backend(&app, &writable_path, &backup_path, &bytes).await {
        return Err(error);
    }

    let installed_version = fetch_running_backend_version(&app).await.unwrap_or_else(|| "unknown".to_string());
    println!("{}", LogMessage::BackendUpdateInstalled(previous_version, installed_version.clone()).text());
    emit_progress(&app, BACKEND_UPDATE_PROGRESS_EVENT, UpdateProgress::Done { version: installed_version.clone() });

    Ok(BackendStatus { running: true, installed: true, version: Some(installed_version) })
}
