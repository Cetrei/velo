use crate::log_messages::LogMessage;
use crate::update_progress::{
    download_with_progress, emit_progress, request_timeout, CancellationToken, UpdateProgress, TUNNEL_UPDATE_PROGRESS_EVENT,
};
use serde::{Deserialize, Serialize};
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Child;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

const TUNNEL_BINARY_FILENAME: &str = "cloudflared.exe";
const GITHUB_RELEASES_URL: &str = "https://api.github.com/repos/cloudflare/cloudflared/releases/latest";
const GITHUB_API_ACCEPT_HEADER: &str = "application/vnd.github+json";
const GITHUB_USER_AGENT: &str = "velo-desktop-tunnel-manager";
const WINDOWS_ASSET_NAME: &str = "cloudflared-windows-amd64.exe";
const VERSION_FILE_NAME: &str = "cloudflared.version";
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub struct TunnelState(pub Mutex<Option<Child>>);

#[derive(Serialize)]
pub struct TunnelStatus {
    running: bool,
    installed: bool,
    version: Option<String>,
}

#[derive(Serialize)]
pub struct TunnelUpdateInfo {
    available: bool,
    current_version: Option<String>,
    latest_version: Option<String>,
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

fn resolve_tunnel_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| LogMessage::TunnelDataDirResolveFailed.text())?;
    Ok(data_dir.join("cloudflared"))
}

fn resolve_writable_tunnel_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(resolve_tunnel_dir(app)?.join(TUNNEL_BINARY_FILENAME))
}

fn resolve_version_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(resolve_tunnel_dir(app)?.join(VERSION_FILE_NAME))
}

fn resolve_partial_download_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(resolve_tunnel_dir(app)?.join(format!("{TUNNEL_BINARY_FILENAME}.partial")))
}

fn is_tunnel_installed(app: &AppHandle) -> bool {
    resolve_writable_tunnel_path(app).map(|path| path.exists()).unwrap_or(false)
}

fn read_installed_version(app: &AppHandle) -> Option<String> {
    let version_path = resolve_version_file_path(app).ok()?;
    std::fs::read_to_string(version_path).ok().map(|content| content.trim().to_string())
}

fn write_installed_version(app: &AppHandle, version: &str) -> Result<(), String> {
    let version_path = resolve_version_file_path(app)?;
    std::fs::write(&version_path, version)
        .map_err(|_| LogMessage::TunnelVersionWriteFailed(version_path.display().to_string()).text())
}

async fn fetch_latest_tunnel_release() -> Result<GithubRelease, String> {
    let client = reqwest::Client::builder()
        .timeout(request_timeout())
        .build()
        .map_err(|error| LogMessage::TunnelReleaseFetchFailed(format!("failed to build HTTP client: {error}")).text())?;
    let response = client
        .get(GITHUB_RELEASES_URL)
        .header("Accept", GITHUB_API_ACCEPT_HEADER)
        .header("User-Agent", GITHUB_USER_AGENT)
        .send()
        .await
        .map_err(|error| LogMessage::TunnelReleaseFetchFailed(error.to_string()).text())?;

    if !response.status().is_success() {
        return Err(LogMessage::TunnelReleaseFetchFailed(format!(
            "{GITHUB_RELEASES_URL} responded with HTTP {}",
            response.status()
        ))
        .text());
    }

    let release: GithubRelease = response
        .json()
        .await
        .map_err(|error| LogMessage::TunnelReleaseFetchFailed(error.to_string()).text())?;

    if release.draft || release.prerelease {
        return Err(LogMessage::TunnelReleaseFetchFailed("latest release is a draft or prerelease".to_string()).text());
    }
    Ok(release)
}

fn extract_tunnel_download_url(release: &GithubRelease) -> Result<String, String> {
    release
        .assets
        .iter()
        .find(|asset| asset.name.eq_ignore_ascii_case(WINDOWS_ASSET_NAME))
        .map(|asset| asset.browser_download_url.clone())
        .ok_or_else(|| LogMessage::TunnelReleaseFetchFailed(format!("release {} has no {} asset", release.tag_name, WINDOWS_ASSET_NAME)).text())
}

fn write_tunnel_binary_to_disk(app: &AppHandle, writable_path: &PathBuf, binary: &[u8]) -> Result<(), String> {
    let parent = writable_path
        .parent()
        .ok_or_else(|| LogMessage::TunnelDataDirResolveFailed.text())?;
    std::fs::create_dir_all(parent)
        .map_err(|_| LogMessage::TunnelInstallFailed(writable_path.display().to_string()).text())?;

    emit_progress(app, TUNNEL_UPDATE_PROGRESS_EVENT, UpdateProgress::RemovingOld);

    let temp_path = writable_path.with_extension("exe.new");
    std::fs::write(&temp_path, binary)
        .map_err(|_| LogMessage::TunnelInstallFailed(writable_path.display().to_string()).text())?;

    emit_progress(app, TUNNEL_UPDATE_PROGRESS_EVENT, UpdateProgress::InstallingNew);
    std::fs::rename(&temp_path, writable_path)
        .map_err(|_| LogMessage::TunnelInstallFailed(writable_path.display().to_string()).text())
}

async fn install_latest_tunnel_binary(app: &AppHandle) -> Result<String, String> {
    emit_progress(app, TUNNEL_UPDATE_PROGRESS_EVENT, UpdateProgress::CheckingRelease);
    let release = fetch_latest_tunnel_release().await?;
    let download_url = extract_tunnel_download_url(&release)?;
    let partial_path = resolve_partial_download_path(app)?;
    let never_cancelled = CancellationToken::new();
    let binary = download_with_progress(app, TUNNEL_UPDATE_PROGRESS_EVENT, &download_url, &partial_path, &never_cancelled)
        .await
        .map_err(|_| LogMessage::TunnelDownloadFailed("tunnel download failed".to_string()).text())?;

    let writable_path = resolve_writable_tunnel_path(app)?;
    write_tunnel_binary_to_disk(app, &writable_path, &binary)?;
    write_installed_version(app, &release.tag_name)?;

    println!("{}", LogMessage::TunnelInstalled(release.tag_name.clone()).text());
    Ok(release.tag_name)
}

async fn ensure_tunnel_binary_up_to_date(app: &AppHandle) -> Result<(), String> {
    let current_version = read_installed_version(app);
    let release = fetch_latest_tunnel_release().await?;

    let is_up_to_date = current_version.as_deref() == Some(release.tag_name.as_str()) && is_tunnel_installed(app);
    if is_up_to_date {
        return Ok(());
    }

    install_latest_tunnel_binary(app).await.map(|_| ())
}

fn read_managed_tunnel_settings(app: &AppHandle) -> Result<(bool, String), String> {
    let user_config = crate::config::get_user_config(app)?;
    let cloudflare_relay = user_config
        .get("connection")
        .and_then(|connection| connection.get("cloudflare_relay"))
        .ok_or_else(|| LogMessage::TunnelConfigMissing.text())?;

    let managed = cloudflare_relay
        .get("managed")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);
    let token = cloudflare_relay
        .get("tunnel_token")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();

    Ok((managed, token))
}

fn kill_running_tunnel(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<TunnelState>();
    let mut guard = state.0.lock().unwrap();
    let Some(mut child) = guard.take() else {
        return Ok(());
    };
    child.kill().map_err(|_| LogMessage::TunnelKillFailed.text())?;
    child.wait().map_err(|_| LogMessage::TunnelKillFailed.text())?;
    Ok(())
}

fn spawn_tunnel_with_token(app: &AppHandle, token: &str) -> Result<(), String> {
    let binary_path = resolve_writable_tunnel_path(app)?;
    if !binary_path.exists() {
        return Err(LogMessage::TunnelBinaryMissing(binary_path.display().to_string()).text());
    }

    let child = std::process::Command::new(&binary_path)
        .args(["tunnel", "run", "--token", token])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|error| LogMessage::TunnelSpawnFailed(error.to_string()).text())?;

    println!("{}", LogMessage::TunnelSpawned.text());
    app.state::<TunnelState>().0.lock().unwrap().replace(child);
    Ok(())
}

pub fn sync_tunnel_with_config(app: &AppHandle) {
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(error) = try_sync_tunnel_with_config(&app_handle).await {
            eprintln!("{error}");
        }
    });
}

async fn try_sync_tunnel_with_config(app: &AppHandle) -> Result<(), String> {
    let (managed, token) = read_managed_tunnel_settings(app)?;
    kill_running_tunnel(app)?;

    if !managed || token.is_empty() {
        println!("{}", LogMessage::TunnelStartupSkippedUnmanaged.text());
        return Ok(());
    }

    ensure_tunnel_binary_up_to_date(app).await?;
    emit_progress(app, TUNNEL_UPDATE_PROGRESS_EVENT, UpdateProgress::Starting);
    spawn_tunnel_with_token(app, &token)
}

#[tauri::command]
pub fn get_tunnel_status(app: AppHandle) -> TunnelStatus {
    let running = app.state::<TunnelState>().0.lock().unwrap().is_some();
    TunnelStatus { running, installed: is_tunnel_installed(&app), version: read_installed_version(&app) }
}

#[tauri::command]
pub async fn check_tunnel_update(app: AppHandle) -> Result<TunnelUpdateInfo, String> {
    let current_version = read_installed_version(&app);
    let release = fetch_latest_tunnel_release().await?;

    let available = current_version.as_deref() != Some(release.tag_name.as_str()) || !is_tunnel_installed(&app);
    Ok(TunnelUpdateInfo { available, current_version, latest_version: Some(release.tag_name) })
}

#[tauri::command]
pub async fn restart_managed_tunnel(app: AppHandle) -> Result<TunnelStatus, String> {
    match try_sync_tunnel_with_config(&app).await {
        Ok(()) => {
            let latest_version = read_installed_version(&app).unwrap_or_default();
            emit_progress(&app, TUNNEL_UPDATE_PROGRESS_EVENT, UpdateProgress::Done { version: latest_version });
        }
        Err(error) => {
            emit_progress(&app, TUNNEL_UPDATE_PROGRESS_EVENT, UpdateProgress::Failed { message: error.clone() });
            return Err(error);
        }
    }
    Ok(get_tunnel_status(app))
}

#[tauri::command]
pub fn stop_managed_tunnel(app: AppHandle) -> Result<TunnelStatus, String> {
    kill_running_tunnel(&app)?;
    Ok(get_tunnel_status(app))
}

pub fn stop_tunnel_before_exit(app: &AppHandle) {
    let is_managed = read_managed_tunnel_settings(app).map(|(managed, _)| managed).unwrap_or(false);
    if !is_managed {
        return;
    }
    let _ = kill_running_tunnel(app);
}
