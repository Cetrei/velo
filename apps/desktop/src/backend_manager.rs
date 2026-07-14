use crate::log_messages::LogMessage;
use serde::{Deserialize, Serialize};
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Child;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

const BACKEND_BINARY_FILENAME: &str = "velo-backend.exe";
const GITHUB_API_ACCEPT_HEADER: &str = "application/vnd.github+json";
const GITHUB_USER_AGENT: &str = "velo-desktop-backend-manager";
const BACKEND_TAG_PREFIX: &str = "backend-v";
const CREATE_NO_WINDOW: u32 = 0x08000000;
const BACKEND_REPLACE_MAX_ATTEMPTS: u32 = 5;
const BACKEND_REPLACE_RETRY_BASE_DELAY_MS: u64 = 200;

pub struct BackendState(pub Mutex<Option<Child>>);

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

fn resolve_writable_backend_path(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| LogMessage::BackendDataDirResolveFailed.text())?;
    Ok(data_dir.join("backend").join(BACKEND_BINARY_FILENAME))
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
    let url = resolve_local_version_url(app).ok()?;
    println!("{}", LogMessage::BackendVersionFetchAttempt(url.clone()).text());

    let Ok(response) = reqwest::get(&url).await else {
        println!("{}", LogMessage::BackendVersionFetchUnreachable(url).text());
        return None;
    };
    let Ok(parsed) = response.json::<LocalVersionResponse>().await else {
        println!("{}", LogMessage::BackendVersionFetchUnreachable(url).text());
        return None;
    };

    println!("{}", LogMessage::BackendVersionFetchResult(url, parsed.version.clone()).text());
    Some(parsed.version)
}

fn is_windows_backend_asset(name: &str) -> bool {
    name.eq_ignore_ascii_case(BACKEND_BINARY_FILENAME)
}

async fn fetch_latest_backend_release(app: &AppHandle) -> Result<GithubRelease, String> {
    let repo = resolve_releases_repo(app)?;
    let releases_url = format!("https://api.github.com/repos/{repo}/releases");

    let client = reqwest::Client::new();
    let response = client
        .get(&releases_url)
        .header("Accept", GITHUB_API_ACCEPT_HEADER)
        .header("User-Agent", GITHUB_USER_AGENT)
        .send()
        .await
        .map_err(|error| LogMessage::BackendReleaseFetchFailed(error.to_string()).text())?;

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

fn remove_backend_binary_and_directory(app: &AppHandle) -> Result<(), String> {
    let writable_path = resolve_writable_backend_path(app)?;
    if !writable_path.exists() {
        return Ok(());
    }
    let backend_dir = writable_path
        .parent()
        .ok_or_else(|| LogMessage::BackendDataDirResolveFailed.text())?;
    std::fs::remove_dir_all(backend_dir)
        .map_err(|error| LogMessage::BackendUninstallFailed(error.to_string()).text())
}

#[tauri::command]
pub fn uninstall_backend(app: AppHandle) -> Result<BackendStatus, String> {
    kill_running_backend(&app)?;
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

async fn download_backend_binary(url: &str) -> Result<Vec<u8>, String> {
    let response = reqwest::get(url)
        .await
        .map_err(|error| LogMessage::BackendDownloadFailed(error.to_string()).text())?;
    let bytes = response
        .bytes()
        .await
        .map_err(|error| LogMessage::BackendDownloadFailed(error.to_string()).text())?;
    Ok(bytes.to_vec())
}

fn rename_with_retry(temp_path: &PathBuf, writable_path: &PathBuf) -> Result<(), String> {
    let mut last_error = String::new();
    for attempt in 1..=BACKEND_REPLACE_MAX_ATTEMPTS {
        match std::fs::rename(temp_path, writable_path) {
            Ok(()) => return Ok(()),
            Err(error) => {
                last_error = error.to_string();
                println!("{}", LogMessage::BackendReplaceRetrying(attempt, last_error.clone()).text());
                let delay = BACKEND_REPLACE_RETRY_BASE_DELAY_MS * attempt as u64;
                std::thread::sleep(std::time::Duration::from_millis(delay));
            }
        }
    }
    Err(LogMessage::BackendReplaceFailed(last_error).text())
}

fn replace_backend_binary_on_disk(writable_path: &PathBuf, new_binary: &[u8]) -> Result<(), String> {
    let parent = writable_path
        .parent()
        .ok_or_else(|| LogMessage::BackendDataDirResolveFailed.text())?;
    std::fs::create_dir_all(parent)
        .map_err(|error| LogMessage::BackendReplaceFailed(error.to_string()).text())?;

    let temp_path = writable_path.with_extension("exe.new");
    std::fs::write(&temp_path, new_binary)
        .map_err(|error| LogMessage::BackendReplaceFailed(error.to_string()).text())?;
    rename_with_retry(&temp_path, writable_path)
}

#[tauri::command]
pub async fn install_backend_update(app: AppHandle) -> Result<BackendStatus, String> {
    let previous_version = fetch_running_backend_version(&app).await;
    let release = fetch_latest_backend_release(&app).await?;
    let download_url = extract_backend_download_url(&release)?;
    let new_binary = download_backend_binary(&download_url).await?;

    kill_running_backend(&app)?;
    kill_orphaned_backend_processes_by_name();

    let writable_path = resolve_writable_backend_path(&app)?;
    replace_backend_binary_on_disk(&writable_path, &new_binary)?;
    spawn_backend(&app)?;

    let latest_version = tag_to_version_name(&release.tag_name);
    println!(
        "{}",
        LogMessage::BackendUpdateInstalled(previous_version.clone().unwrap_or_default(), latest_version.clone()).text()
    );

    Ok(BackendStatus { running: true, installed: true, version: Some(latest_version) })
}
