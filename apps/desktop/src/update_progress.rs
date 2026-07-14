use futures_util::StreamExt;
use serde::Serialize;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tauri::{AppHandle, Emitter};

pub const BACKEND_UPDATE_PROGRESS_EVENT: &str = "backend-update-progress";
pub const TUNNEL_UPDATE_PROGRESS_EVENT: &str = "tunnel-update-progress";

const PROGRESS_EMIT_INTERVAL_MS: u128 = 150;
const DOWNLOAD_CONNECT_TIMEOUT_SECS: u64 = 30;
const DOWNLOAD_STALL_TIMEOUT_SECS: u64 = 30;
const REQUEST_TIMEOUT_SECS: u64 = 15;

#[derive(Clone, Serialize)]
#[serde(tag = "phase", rename_all = "snake_case")]
pub enum UpdateProgress {
    CheckingRelease,
    Downloading { received_bytes: u64, total_bytes: Option<u64>, bytes_per_sec: u64 },
    Paused { received_bytes: u64, total_bytes: Option<u64> },
    Verifying,
    BackingUp,
    RemovingOld,
    InstallingNew,
    Starting,
    Done { version: String },
    Cancelled,
    Failed { message: String },
    RolledBack { message: String },
}

/// Cooperative cancellation flag shared between the frontend-triggered
/// cancel command and the in-flight download loop. A plain AtomicBool is
/// enough here because there is only ever one update in flight per
/// updatable component (backend or tunnel), each with its own token.
#[derive(Clone, Default)]
pub struct CancellationToken(Arc<AtomicBool>);

impl CancellationToken {
    pub fn new() -> Self {
        Self(Arc::new(AtomicBool::new(false)))
    }

    pub fn cancel(&self) {
        self.0.store(true, Ordering::SeqCst);
    }

    pub fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }
}

/// Carries the real, specific failure reason up to the caller instead of a
/// generic sentinel. Callers decide how to log or surface `Failed`, so the
/// underlying cause (a timeout, a stream reset, an HTTP status) is not lost
/// before it reaches the progress event the user actually sees.
pub enum DownloadError {
    Cancelled,
    Failed(String),
}

const CANCELLED_MARKER: &str = "__cancelled__";

pub fn build_http_client(timeout_secs: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .build()
        .map_err(|error| format!("failed to build HTTP client: {error}"))
}

/// Builds a client for large, potentially long-running downloads. Unlike
/// `build_http_client`, this has no total-request timeout, since a full
/// backend binary can legitimately take longer than a short fixed window
/// to download on a slow connection. `connect_timeout` still bounds how
/// long establishing the TCP/TLS connection itself can take, and
/// `read_timeout` aborts the request if no bytes arrive for a stretch,
/// which is what actually indicates a stalled or dead connection.
fn build_download_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(DOWNLOAD_CONNECT_TIMEOUT_SECS))
        .read_timeout(std::time::Duration::from_secs(DOWNLOAD_STALL_TIMEOUT_SECS))
        .build()
        .map_err(|error| format!("failed to build HTTP client: {error}"))
}

pub fn request_timeout() -> std::time::Duration {
    std::time::Duration::from_secs(REQUEST_TIMEOUT_SECS)
}

pub fn emit_progress(app: &AppHandle, event_name: &str, progress: UpdateProgress) {
    let _ = app.emit(event_name, progress);
}

fn read_partial_download_size(partial_path: &Path) -> u64 {
    std::fs::metadata(partial_path).map(|metadata| metadata.len()).unwrap_or(0)
}

async fn open_download_response(
    client: &reqwest::Client,
    url: &str,
    resume_from_bytes: u64,
) -> Result<reqwest::Response, String> {
    let mut request = client.get(url);
    if resume_from_bytes > 0 {
        request = request.header("Range", format!("bytes={resume_from_bytes}-"));
    }

    let response = request.send().await.map_err(|error| format!("download request failed: {error}"))?;

    if !response.status().is_success() && response.status().as_u16() != 206 {
        return Err(format!("download request returned HTTP {}", response.status()));
    }

    Ok(response)
}

/// Downloads a URL to `partial_path` with a per-request timeout, emitting
/// incremental `Downloading` progress events (received/total bytes and a
/// rolling bytes-per-second estimate) at most once every ~150ms.
///
/// The download is resumable: if `partial_path` already has bytes on disk
/// from a previous attempt, this issues a `Range` request to continue from
/// where it left off instead of re-downloading from zero. It is also
/// cancellable through `cancellation`, checked between chunks so a cancel
/// request lands within one network read instead of waiting for the whole
/// transfer to finish.
pub async fn download_with_progress(
    app: &AppHandle,
    event_name: &str,
    url: &str,
    partial_path: &Path,
    cancellation: &CancellationToken,
) -> Result<Vec<u8>, DownloadError> {
    download_with_progress_inner(app, event_name, url, partial_path, cancellation)
        .await
        .map_err(|error| if error == CANCELLED_MARKER { DownloadError::Cancelled } else { DownloadError::Failed(error) })
}

async fn download_with_progress_inner(
    app: &AppHandle,
    event_name: &str,
    url: &str,
    partial_path: &Path,
    cancellation: &CancellationToken,
) -> Result<Vec<u8>, String> {
    let client = build_download_http_client()?;
    let resume_from_bytes = read_partial_download_size(partial_path);
    let response = open_download_response(&client, url, resume_from_bytes).await?;

    let is_resumed = response.status().as_u16() == 206;
    let content_length = response.content_length();
    let total_bytes = if is_resumed { content_length.map(|remaining| remaining + resume_from_bytes) } else { content_length };

    let mut buffer: Vec<u8> = if is_resumed {
        std::fs::read(partial_path).unwrap_or_default()
    } else {
        Vec::with_capacity(total_bytes.unwrap_or(0) as usize)
    };
    let mut received_bytes: u64 = buffer.len() as u64;
    let mut stream = response.bytes_stream();

    let started_at = Instant::now();
    let mut last_emit_at = Instant::now();

    while let Some(chunk_result) = stream.next().await {
        if cancellation.is_cancelled() {
            std::fs::write(partial_path, &buffer).ok();
            emit_progress(app, event_name, UpdateProgress::Cancelled);
            return Err(CANCELLED_MARKER.to_string());
        }

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
    emit_progress(app, event_name, UpdateProgress::Downloading { received_bytes, total_bytes, bytes_per_sec });

    std::fs::remove_file(partial_path).ok();
    Ok(buffer)
}
