use crate::log_messages::LogMessage;
use crate::update_progress::build_http_client;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Manager};

// Small, fixed bounds for the pre-navigation verification pass. An
// unreachable network must not hang app startup, so this stays bounded
// rather than retrying indefinitely.
const VERIFY_MAX_ATTEMPTS: u32 = 3;
const VERIFY_RETRY_DELAY_MS: u64 = 500;
const VERIFY_REQUEST_TIMEOUT_SECS: u64 = 5;

const UI_CACHE_DIR_NAME: &str = "ui-cache";
const UI_CACHE_INDEX_FILE: &str = "index.html";

fn build_pages_url() -> String {
    let raw_url = env!("VELO_PAGES_URL");
    raw_url.to_string()
}

/// One bounded GET against `VELO_PAGES_URL` per attempt, used both to
/// decide whether the main window can safely navigate to the remote origin
/// on this launch, and to gate the opportunistic UI cache refresh below.
/// This is a plain reachability check, not a page render, so a short
/// per-request timeout is enough.
async fn verify_pages_reachable(url: &str) -> bool {
    let Ok(client) = build_http_client(VERIFY_REQUEST_TIMEOUT_SECS) else {
        return false;
    };

    for attempt in 1..=VERIFY_MAX_ATTEMPTS {
        match client.get(url).send().await {
            Ok(response) if response.status().is_success() => return true,
            Ok(response) => {
                println!(
                    "{}",
                    LogMessage::FrontendVerifyRetrying(attempt, format!("HTTP {}", response.status())).text()
                );
            }
            Err(error) => {
                println!("{}", LogMessage::FrontendVerifyRetrying(attempt, error.to_string()).text());
            }
        }

        if attempt < VERIFY_MAX_ATTEMPTS {
            tokio::time::sleep(Duration::from_millis(VERIFY_RETRY_DELAY_MS)).await;
        }
    }

    false
}

fn resolve_ui_cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|_| LogMessage::FrontendCacheDirResolveFailed.text())?;
    Ok(app_data_dir.join(UI_CACHE_DIR_NAME))
}

fn ui_cache_has_content(cache_dir: &Path) -> bool {
    cache_dir.join(UI_CACHE_INDEX_FILE).exists()
}

/// Opportunistically fetches and persists a copy of the served UI into the
/// writable cache directory, replacing whatever was cached before. This
/// only runs on the happy path (the remote origin already verified
/// reachable), and a failure here must never affect the already-succeeded
/// navigation to the remote origin: it only means the next offline
/// fallback serves an older cached copy, or ultimately the embedded build,
/// instead of a fresher one.
///
/// The cache stores a flat copy of the single-page app's built assets.
/// Since Velo-UI is a Vite SPA served from a single origin, mirroring the
/// origin's own asset manifest here (rather than crawling links) keeps this
/// simple: fetch `index.html`, then every asset it references under
/// `/assets/`, discovered from the already-fetched `index.html` markup.
async fn refresh_ui_cache(app: &AppHandle, base_url: &str) {
    println!("{}", LogMessage::FrontendCacheRefreshStarted.text());

    let Ok(cache_dir) = resolve_ui_cache_dir(app) else {
        println!("{}", LogMessage::FrontendCacheDirResolveFailed.text());
        return;
    };

    if let Err(error) = fetch_and_write_ui_cache(&cache_dir, base_url).await {
        println!("{}", LogMessage::FrontendCacheRefreshFailed(error).text());
    }
}

async fn fetch_and_write_ui_cache(cache_dir: &Path, base_url: &str) -> Result<(), String> {
    let client = build_http_client(VERIFY_REQUEST_TIMEOUT_SECS)?;

    let index_html = fetch_text(&client, base_url).await?;
    std::fs::create_dir_all(cache_dir).map_err(|error| error.to_string())?;
    std::fs::write(cache_dir.join(UI_CACHE_INDEX_FILE), &index_html).map_err(|error| error.to_string())?;

    let asset_paths = extract_asset_paths(&index_html);
    let mut written_count = 1;

    for asset_path in asset_paths {
        let asset_url = format!("{}/{}", base_url.trim_end_matches('/'), asset_path.trim_start_matches('/'));
        let Ok(bytes) = fetch_bytes(&client, &asset_url).await else {
            continue;
        };

        let destination = cache_dir.join(&asset_path);
        if let Some(parent) = destination.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        if std::fs::write(&destination, &bytes).is_ok() {
            written_count += 1;
        }
    }

    println!("{}", LogMessage::FrontendCacheRefreshCompleted(written_count).text());
    Ok(())
}

async fn fetch_text(client: &reqwest::Client, url: &str) -> Result<String, String> {
    let response = client.get(url).send().await.map_err(|error| error.to_string())?;
    response.text().await.map_err(|error| error.to_string())
}

async fn fetch_bytes(client: &reqwest::Client, url: &str) -> Result<Vec<u8>, String> {
    let response = client.get(url).send().await.map_err(|error| error.to_string())?;
    let bytes = response.bytes().await.map_err(|error| error.to_string())?;
    Ok(bytes.to_vec())
}

/// Extracts every `/assets/...` reference from the fetched `index.html`.
/// Velo-UI's Vite build emits hashed asset paths directly in `<script>` and
/// `<link>` tags, so a plain substring scan for `/assets/` is enough here
/// without pulling in a full HTML parser for a one-shot best-effort cache.
fn extract_asset_paths(html: &str) -> Vec<String> {
    const ASSET_PREFIX: &str = "/assets/";
    let mut paths = Vec::new();

    let mut search_from = 0;
    while let Some(relative_start) = html[search_from..].find(ASSET_PREFIX) {
        let start = search_from + relative_start;
        let remainder = &html[start..];
        let end_offset = remainder.find(['"', '\'']).unwrap_or(remainder.len());
        let path = &remainder[..end_offset];

        if !path.is_empty() {
            paths.push(path.to_string());
        }
        search_from = start + end_offset.max(1);
    }

    paths
}

/// Guesses a `Content-Type` from a file extension. The cached UI is only
/// ever HTML/CSS/JS/common web assets (a Vite SPA build), so this small,
/// explicit table is enough; anything unrecognized falls back to
/// `application/octet-stream`, which browsers handle safely as a download
/// rather than misrendering.
fn guess_content_type(path: &Path) -> &'static str {
    match path.extension().and_then(|extension| extension.to_str()) {
        Some("html") => "text/html; charset=utf-8",
        Some("js") => "application/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("json") => "application/json; charset=utf-8",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("ico") => "image/x-icon",
        Some("woff2") => "font/woff2",
        _ => "application/octet-stream",
    }
}

/// Correction to the original Phase 6.1b plan: `tauri-plugin-localhost`
/// serves the app's own bundled `asset_resolver()` (what `frontendDist`
/// already packages at build time), not an arbitrary directory written to
/// disk at runtime. It has no API to point it at `ui-cache/`, so it cannot
/// serve this cache. The correct mechanism is a small static file server
/// bound to a loopback port, serving `cache_dir` directly from disk. This
/// keeps the same observable behavior Phase 6.1b specified (a real HTTP
/// origin so IPC and relative asset paths behave like a normal
/// `frontendDist` load) without depending on a plugin that cannot do this.
fn spawn_local_cache_server(cache_dir: PathBuf, port: u16) -> Result<(), String> {
    let server =
        tiny_http::Server::http(format!("127.0.0.1:{port}")).map_err(|error| error.to_string())?;

    std::thread::spawn(move || {
        for request in server.incoming_requests() {
            let requested_path = request.url().trim_start_matches('/');
            let file_path = if requested_path.is_empty() {
                cache_dir.join(UI_CACHE_INDEX_FILE)
            } else {
                cache_dir.join(requested_path)
            };

            let response_result = std::fs::read(&file_path).or_else(|_| std::fs::read(cache_dir.join(UI_CACHE_INDEX_FILE)));

            match response_result {
                Ok(bytes) => {
                    let content_type = guess_content_type(&file_path);
                    let header = tiny_http::Header::from_bytes(&b"Content-Type"[..], content_type.as_bytes())
                        .expect("static content-type header is always valid");
                    let response = tiny_http::Response::from_data(bytes).with_header(header);
                    let _ = request.respond(response);
                }
                Err(_) => {
                    let response = tiny_http::Response::from_string("not found").with_status_code(404);
                    let _ = request.respond(response);
                }
            }
        }
    });

    Ok(())
}

pub enum StartupFrontend {
    Remote(String),
    LocalCache { port: u16 },
    Embedded,
}

impl StartupFrontend {
    pub fn into_webview_url(self) -> tauri::WebviewUrl {
        match self {
            StartupFrontend::Remote(url) => tauri::WebviewUrl::External(
                url.parse().unwrap_or_else(|_| panic!("{}", LogMessage::PagesUrlInvalid(url).text())),
            ),
            StartupFrontend::LocalCache { port } => {
                let local_url: tauri::Url = format!("http://127.0.0.1:{port}")
                    .parse()
                    .expect("loopback URL is always valid");
                tauri::WebviewUrl::External(local_url)
            }
            StartupFrontend::Embedded => tauri::WebviewUrl::App(PathBuf::from("index.html")),
        }
    }
}

/// Resolves what the main window should load on this launch, following
/// Phase 6.1b's load order: verify `VELO_PAGES_URL` is reachable first
/// (Tauri v2 has no reliable post-navigation failure event, so this runs
/// before the window is created rather than reacting to one), then the
/// local UI cache if verification is exhausted, then the embedded
/// `frontendDist` build as the final rung if no cache exists either.
///
/// On the happy path (remote verified reachable), this also kicks off an
/// opportunistic, non-blocking cache refresh so a future offline launch has
/// something recent to fall back to.
pub async fn resolve_startup_frontend(app: &AppHandle) -> StartupFrontend {
    let pages_url = build_pages_url();

    if verify_pages_reachable(&pages_url).await {
        let app_handle = app.clone();
        let refresh_url = pages_url.clone();
        tauri::async_runtime::spawn(async move {
            refresh_ui_cache(&app_handle, &refresh_url).await;
        });
        return StartupFrontend::Remote(pages_url);
    }

    println!("{}", LogMessage::FrontendVerifyExhausted(VERIFY_MAX_ATTEMPTS).text());

    let Ok(cache_dir) = resolve_ui_cache_dir(app) else {
        println!("{}", LogMessage::FrontendFallbackToEmbedded.text());
        return StartupFrontend::Embedded;
    };

    if !ui_cache_has_content(&cache_dir) {
        println!("{}", LogMessage::FrontendCacheUnavailable.text());
        return StartupFrontend::Embedded;
    }

    let Some(port) = portpicker::pick_unused_port() else {
        println!("{}", LogMessage::FrontendLocalhostPortPickFailed.text());
        return StartupFrontend::Embedded;
    };

    match spawn_local_cache_server(cache_dir, port) {
        Ok(()) => {
            println!("{}", LogMessage::FrontendCacheServing(port).text());
            StartupFrontend::LocalCache { port }
        }
        Err(error) => {
            println!("{error}");
            StartupFrontend::Embedded
        }
    }
}
