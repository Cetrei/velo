use crate::log_messages::LogMessage;
use crate::module_manager::{HealthCheckKind, InstallStrategy, Module};
use crate::update_progress::{build_http_client, request_timeout};
use minisign_verify::{PublicKey, Signature};
use serde::Deserialize;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const GITHUB_API_ACCEPT_HEADER: &str = "application/vnd.github+json";
const GITHUB_USER_AGENT: &str = "velo-desktop-manifest";
const MANIFEST_ASSET_NAME: &str = "manifest.json";
const MANIFEST_SIGNATURE_ASSET_NAME: &str = "manifest.json.sig";
const SHELL_RELEASE_TAG_PREFIX: &str = "v";
const MANIFEST_CACHE_JSON_FILENAME: &str = "manifest-cache.json";
const MANIFEST_CACHE_SIGNATURE_FILENAME: &str = "manifest-cache.json.sig";
const MANIFEST_CACHE_TAG_FILENAME: &str = "manifest-cache.tag";

/// The only schema version this build of the shell knows how to read.
/// Bumped only alongside a shell release that can actually parse the new
/// shape. A manifest whose `version` does not match is refused outright
/// rather than parsed best-effort: silently accepting an unknown schema
/// version risks either a serde default masking a missing required field,
/// or a future schema change reusing a field name with different meaning.
const MANIFEST_SCHEMA_VERSION: u32 = 1;

/// The same minisign public key already trusted for the Tauri updater
/// (`plugins.updater.pubkey` in `tauri.conf.json`). Reusing it means the
/// manifest is verified with a key that is already an established trust
/// root for this app, instead of introducing a second key to manage and
/// rotate. This is the public key box's data line only, not the full
/// "untrusted comment" box format minisign writes to a `.pub` file.
const MANIFEST_PUBLIC_KEY_BASE64: &str = "RWRMSmue/rOsHnzwQrnGpG5VYdWPg6vD57Q+0ZG0jK2iqUNgBiT0wjla";

#[derive(Deserialize)]
struct ManifestModuleEntry {
    id: String,
    strategy: InstallStrategy,
    release_repo: String,
    tag_prefix: String,
    binary_asset_name: String,
    health_check: ManifestHealthCheckEntry,
    /// Writable data subdirectory this module's binary lives in. Optional
    /// in the schema because most modules have no reason to diverge from
    /// their own id; only kept as a distinct field for modules with a
    /// pre-manifest on-disk history (`server` shipped under `backend`,
    /// `tunnel` shipped under `cloudflared`, both from the pre-Phase-3
    /// hardcoded module constants). Absent means "same as id", never
    /// silently guessed at differently, so a manifest author who forgets to
    /// set this for a genuinely new module simply gets the default
    /// behavior, not a migration bug.
    #[serde(default)]
    data_subdir: Option<String>,
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum ManifestHealthCheckEntry {
    Http { local_version_path: String },
    None,
}

#[derive(Deserialize)]
struct Manifest {
    version: u32,
    modules: Vec<ManifestModuleEntry>,
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

fn resolve_shell_release_tag(app: &AppHandle) -> String {
    format!("{SHELL_RELEASE_TAG_PREFIX}{}", app.package_info().version)
}

fn resolve_manifest_repo(app: &AppHandle) -> String {
    crate::config::get_system_config(app)
        .ok()
        .and_then(|system_config| {
            system_config
                .get("releases")
                .and_then(|releases| releases.get("repo"))
                .and_then(|value| value.as_str())
                .map(|repo| repo.to_string())
        })
        .unwrap_or_default()
}

async fn fetch_shell_release_by_tag(app: &AppHandle, repo: &str, tag: &str) -> Result<GithubRelease, String> {
    let release_url = format!("https://api.github.com/repos/{repo}/releases/tags/{tag}");

    let client = build_http_client(request_timeout().as_secs())
        .map_err(|error| LogMessage::ManifestFetchFailed(error).text())?;
    let response = client
        .get(&release_url)
        .header("Accept", GITHUB_API_ACCEPT_HEADER)
        .header("User-Agent", GITHUB_USER_AGENT)
        .send()
        .await
        .map_err(|error| LogMessage::ManifestFetchFailed(error.to_string()).text())?;

    if !response.status().is_success() {
        return Err(LogMessage::ManifestFetchFailed(format!("{release_url} responded with HTTP {}", response.status())).text());
    }

    let release: GithubRelease = response
        .json()
        .await
        .map_err(|error| LogMessage::ManifestFetchFailed(error.to_string()).text())?;

    if release.draft || release.prerelease {
        return Err(LogMessage::ManifestFetchFailed(format!("release {tag} is a draft or prerelease, refusing to trust its manifest")).text());
    }
    let _ = app;
    Ok(release)
}

fn extract_asset_download_url(release: &GithubRelease, asset_name: &str) -> Result<String, String> {
    release
        .assets
        .iter()
        .find(|asset| asset.name.eq_ignore_ascii_case(asset_name))
        .map(|asset| asset.browser_download_url.clone())
        .ok_or_else(|| LogMessage::ManifestFetchFailed(format!("release {} has no {asset_name} asset", release.tag_name)).text())
}

async fn download_asset_bytes(url: &str) -> Result<Vec<u8>, String> {
    let client = build_http_client(request_timeout().as_secs())
        .map_err(|error| LogMessage::ManifestFetchFailed(error).text())?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| LogMessage::ManifestFetchFailed(error.to_string()).text())?;

    if !response.status().is_success() {
        return Err(LogMessage::ManifestFetchFailed(format!("{url} responded with HTTP {}", response.status())).text());
    }

    response.bytes().await.map(|bytes| bytes.to_vec()).map_err(|error| LogMessage::ManifestFetchFailed(error.to_string()).text())
}

async fn download_asset_text(url: &str) -> Result<String, String> {
    let bytes = download_asset_bytes(url).await?;
    String::from_utf8(bytes).map_err(|error| LogMessage::ManifestFetchFailed(format!("asset is not valid UTF-8: {error}")).text())
}

/// Verifies the manifest's minisign signature before returning its bytes.
/// This must run before any JSON parsing happens: verifying after parsing
/// would mean a malformed-but-plausible manifest could already have been
/// acted on by the time the signature check fails.
fn verify_manifest_signature(manifest_json: &str, signature_text: &str) -> Result<(), String> {
    let public_key = PublicKey::from_base64(MANIFEST_PUBLIC_KEY_BASE64)
        .map_err(|error| LogMessage::ManifestSignatureInvalid(format!("failed to load trusted public key: {error}")).text())?;
    let signature = Signature::decode(signature_text)
        .map_err(|error| LogMessage::ManifestSignatureInvalid(format!("failed to decode signature: {error}")).text())?;

    public_key
        .verify(manifest_json.as_bytes(), &signature, false)
        .map_err(|error| LogMessage::ManifestSignatureInvalid(format!("signature does not match manifest contents: {error}")).text())
}

fn resolve_manifest_cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|_| LogMessage::ManifestCacheUnavailable.text())
}

/// Writes the manifest JSON, its signature, and the release tag it came
/// from to disk, after the caller has already verified the signature once
/// on this same fetch. A failure here only degrades a future offline
/// startup, so it is logged and swallowed rather than propagated, the same
/// way a failed write of the module version record is handled elsewhere in
/// this codebase.
fn write_manifest_cache(app: &AppHandle, manifest_json: &str, signature_text: &str, tag: &str) {
    let Ok(cache_dir) = resolve_manifest_cache_dir(app) else {
        return;
    };
    if let Err(error) = std::fs::create_dir_all(&cache_dir) {
        println!("{}", LogMessage::ManifestCacheWriteFailed(error.to_string()).text());
        return;
    }

    let json_result = std::fs::write(cache_dir.join(MANIFEST_CACHE_JSON_FILENAME), manifest_json);
    let signature_result = std::fs::write(cache_dir.join(MANIFEST_CACHE_SIGNATURE_FILENAME), signature_text);
    let tag_result = std::fs::write(cache_dir.join(MANIFEST_CACHE_TAG_FILENAME), tag);

    if let Err(error) = json_result.and(signature_result).and(tag_result) {
        println!("{}", LogMessage::ManifestCacheWriteFailed(error.to_string()).text());
    }
}

/// Rereads the last manifest cached by `write_manifest_cache` and
/// re-verifies its signature before trusting it. Disk is not a more
/// trustworthy channel than the network fetch was; re-verifying here is
/// what makes it safe to fall back to a cache an attacker could otherwise
/// have tampered with between writes, not an optimization to skip.
fn read_verified_manifest_cache(app: &AppHandle) -> Result<Vec<Module>, String> {
    let cache_dir = resolve_manifest_cache_dir(app)?;
    let manifest_json = std::fs::read_to_string(cache_dir.join(MANIFEST_CACHE_JSON_FILENAME)).map_err(|_| LogMessage::ManifestCacheUnavailable.text())?;
    let signature_text = std::fs::read_to_string(cache_dir.join(MANIFEST_CACHE_SIGNATURE_FILENAME)).map_err(|_| LogMessage::ManifestCacheUnavailable.text())?;
    let tag = std::fs::read_to_string(cache_dir.join(MANIFEST_CACHE_TAG_FILENAME)).unwrap_or_else(|_| "unknown".to_string());

    verify_manifest_signature(&manifest_json, &signature_text).map_err(|error| LogMessage::ManifestCacheSignatureInvalid(error).text())?;

    let manifest: Manifest = serde_json::from_str(&manifest_json).map_err(|error| LogMessage::ManifestParseFailed(error.to_string()).text())?;
    validate_manifest_schema_version(&manifest)?;
    println!("{}", LogMessage::ManifestLoaded(format!("{tag} (cached)"), manifest.modules.len()).text());

    Ok(manifest.modules.into_iter().map(module_from_manifest_entry).collect())
}

/// Refuses a manifest whose schema `version` does not match what this
/// shell build knows how to parse. Called after signature verification but
/// before the parsed `Manifest` is turned into `Module` values, so an
/// unrecognized schema version never silently reaches the rest of the app.
fn validate_manifest_schema_version(manifest: &Manifest) -> Result<(), String> {
    if manifest.version != MANIFEST_SCHEMA_VERSION {
        return Err(LogMessage::ManifestParseFailed(format!(
            "manifest schema version {} is not supported by this build, expected {MANIFEST_SCHEMA_VERSION}",
            manifest.version
        ))
        .text());
    }
    Ok(())
}

fn health_check_from_manifest(entry: ManifestHealthCheckEntry) -> HealthCheckKind {
    match entry {
        ManifestHealthCheckEntry::Http { local_version_path } => HealthCheckKind::Http { local_version_path },
        ManifestHealthCheckEntry::None => HealthCheckKind::None,
    }
}

fn module_from_manifest_entry(entry: ManifestModuleEntry) -> Module {
    let data_subdir = entry.data_subdir.unwrap_or_else(|| entry.id.clone());
    Module {
        id: entry.id,
        strategy: entry.strategy,
        binary_filename: entry.binary_asset_name,
        release_repo: entry.release_repo,
        tag_prefix: entry.tag_prefix,
        health_check: health_check_from_manifest(entry.health_check),
        data_subdir,
    }
}

/// Fetches the manifest asset from the GitHub Release matching the shell's
/// own running version (never "latest"), verifies its minisign signature,
/// and returns the modules it describes as ready-to-use `Module` values.
/// A release is immutable once published, so pinning to the shell's own
/// tag sidesteps any question of manifest freshness or CDN caching.
///
/// If the network fetch fails for any reason (no connectivity, the asset
/// not published yet, a transient GitHub error), this falls back to the
/// last manifest that was itself verified and cached on a previous
/// successful run, re-verifying its signature again before trusting it.
/// Only when both the network fetch and the disk cache are unavailable
/// does this return an error, which callers (`server_manager`,
/// `tunnel_manager`) treat as "cannot resolve a Module this startup" rather
/// than falling back to any hardcoded module description of their own.
pub async fn fetch_and_verify_modules(app: &AppHandle) -> Result<Vec<Module>, String> {
    match fetch_and_verify_modules_from_network(app).await {
        Ok(modules) => Ok(modules),
        Err(fetch_error) => fall_back_to_manifest_cache(app, fetch_error),
    }
}

async fn fetch_and_verify_modules_from_network(app: &AppHandle) -> Result<Vec<Module>, String> {
    let repo = resolve_manifest_repo(app);
    if repo.is_empty() {
        return Err(LogMessage::ManifestFetchFailed("no release repo configured in system.yml".to_string()).text());
    }
    let tag = resolve_shell_release_tag(app);

    let release = fetch_shell_release_by_tag(app, &repo, &tag).await?;
    let manifest_url = extract_asset_download_url(&release, MANIFEST_ASSET_NAME)?;
    let signature_url = extract_asset_download_url(&release, MANIFEST_SIGNATURE_ASSET_NAME)?;

    let manifest_json = download_asset_text(&manifest_url).await?;
    let signature_text = download_asset_text(&signature_url).await?;

    verify_manifest_signature(&manifest_json, &signature_text)?;
    println!("{}", LogMessage::ManifestSignatureVerified(tag.clone()).text());

    let manifest: Manifest = serde_json::from_str(&manifest_json).map_err(|error| LogMessage::ManifestParseFailed(error.to_string()).text())?;
    validate_manifest_schema_version(&manifest)?;
    println!("{}", LogMessage::ManifestLoaded(tag.clone(), manifest.modules.len()).text());

    write_manifest_cache(app, &manifest_json, &signature_text, &tag);

    Ok(manifest.modules.into_iter().map(module_from_manifest_entry).collect())
}

fn fall_back_to_manifest_cache(app: &AppHandle, fetch_error: String) -> Result<Vec<Module>, String> {
    let Ok(modules) = read_verified_manifest_cache(app) else {
        println!("{}", LogMessage::ManifestCacheUnavailable.text());
        return Err(fetch_error);
    };

    let cached_tag = read_manifest_cache_tag(app);
    println!("{}", LogMessage::ManifestCacheUsedAfterFetchFailure(cached_tag, fetch_error).text());
    Ok(modules)
}

fn read_manifest_cache_tag(app: &AppHandle) -> String {
    let Ok(cache_dir) = resolve_manifest_cache_dir(app) else {
        return "unknown".to_string();
    };
    std::fs::read_to_string(cache_dir.join(MANIFEST_CACHE_TAG_FILENAME)).unwrap_or_else(|_| "unknown".to_string())
}
