const ROOT_ENV_PATH: &str = "../../.env";
const PAGES_URL_ENV_KEY: &str = "VELO_PAGES_URL";
const PAGES_URL_DEFAULT: &str = "https://velo.cetrei.dev";

fn expose_pages_url_to_compile_time() {
    let _ = dotenvy::from_path(ROOT_ENV_PATH);
    let pages_url = std::env::var(PAGES_URL_ENV_KEY).unwrap_or_else(|_| PAGES_URL_DEFAULT.to_string());
    println!("cargo:rustc-env={PAGES_URL_ENV_KEY}={pages_url}");
    println!("cargo:rerun-if-changed={ROOT_ENV_PATH}");
}

fn main() {
    expose_pages_url_to_compile_time();
    tauri_build::build()
}
