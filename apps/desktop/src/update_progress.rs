use futures_util::StreamExt;
use serde::Serialize;
use std::time::Instant;
use tauri::{AppHandle, Emitter};

pub const BACKEND_UPDATE_PROGRESS_EVENT: &str = "backend-update-progress";
pub const TUNNEL_UPDATE_PROGRESS_EVENT: &str = "tunnel-update-progress";

const PROGRESS_EMIT_INTERVAL_MS: u128 = 150;
const DOWNLOAD_TIMEOUT_SECS: u64 = 30;
const REQUEST_TIMEOUT_SECS: u64 = 15;

#[derive(Clone, Serialize)]
#[serde(tag = "phase", rename_all = "snake_case")]
pub enum UpdateProgress {
    CheckingRelease,
    Downloading { received_bytes: u64, total_bytes: Option<u64>, bytes_per_sec: u64 },
    RemovingOld,
    InstallingNew,
    Starting,
    Done { version: String },
    Failed { message: String },
}

pub fn build_http_client(timeout_secs: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .build()
        .map_err(|error| format!("failed to build HTTP client: {error}"))
}

pub fn request_timeout() -> std::time::Duration {
    std::time::Duration::from_secs(REQUEST_TIMEOUT_SECS)
}

pub fn emit_progress(app: &AppHandle, event_name: &str, progress: UpdateProgress) {
    let _ = app.emit(event_name, progress);
}

/// Downloads a URL with a per-request timeout, emitting incremental
/// `Downloading` progress events (received/total bytes and a rolling
/// bytes-per-second estimate) at most once every ~150ms so the frontend
/// gets a live, non-spammy progress bar.
pub async fn download_with_progress(
    app: &AppHandle,
    event_name: &str,
    url: &str,
) -> Result<Vec<u8>, String> {
    let client = build_http_client(DOWNLOAD_TIMEOUT_SECS)?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("download request failed: {error}"))?;

    if !response.status().is_success() {
        return Err(format!("download request returned HTTP {}", response.status()));
    }

    let total_bytes = response.content_length();
    let mut received_bytes: u64 = 0;
    let mut buffer: Vec<u8> = Vec::with_capacity(total_bytes.unwrap_or(0) as usize);
    let mut stream = response.bytes_stream();

    let started_at = Instant::now();
    let mut last_emit_at = Instant::now();

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|error| format!("download stream interrupted: {error}"))?;
        received_bytes += chunk.len() as u64;
        buffer.extend_from_slice(&chunk);

        if last_emit_at.elapsed().as_millis() >= PROGRESS_EMIT_INTERVAL_MS {
            let elapsed_secs = started_at.elapsed().as_secs_f64().max(0.001);
            let bytes_per_sec = (received_bytes as f64 / elapsed_secs) as u64;
            emit_progress(
                app,
                event_name,
                UpdateProgress::Downloading { received_bytes, total_bytes, bytes_per_sec },
            );
            last_emit_at = Instant::now();
        }
    }

    let elapsed_secs = started_at.elapsed().as_secs_f64().max(0.001);
    let bytes_per_sec = (received_bytes as f64 / elapsed_secs) as u64;
    emit_progress(
        app,
        event_name,
        UpdateProgress::Downloading { received_bytes, total_bytes, bytes_per_sec },
    );

    Ok(buffer)
}
