use crate::log_messages::LogMessage;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::AppHandle;
use windows::core::PCWSTR;
use windows::Win32::Foundation::ERROR_SUCCESS;
use windows::Win32::System::Registry::{RegCloseKey, RegOpenKeyExW, HKEY, HKEY_CLASSES_ROOT, KEY_READ};

// How often the registry is polled for the virtual camera filter's CLSID.
// This deliberately does not run per frame (30fps would mean a registry
// lookup every ~33ms, adding real I/O latency to the hot push_frame path
// for a condition that changes on the order of minutes, not frames): an
// install/uninstall/repair is the only way this value changes, so a slow
// background poll catches it just as reliably as a per-frame check would,
// at zero cost to frame latency. See TODO.md's BackendNotRegistered flag
// for why this must not live inside crates/vcam-driver's hot write path.
const REGISTRY_POLL_INTERVAL_SECS: u64 = 5;

// Cached result of the last registry poll. push_frame reads this
// synchronously with no I/O; only the background poll task below ever
// writes to it. Starts true so a slow first poll cannot cause a false
// "not registered" flash on every app startup before the first check runs.
static DRIVER_REGISTERED: AtomicBool = AtomicBool::new(true);

// Cached CLSID read once from system.yml at watchdog startup. push_frame's
// error path reads this instead of re-parsing YAML on every failed frame.
static CONFIGURED_CLSID: Mutex<String> = Mutex::new(String::new());

#[derive(Serialize)]
pub struct DriverStatus {
    pub registered: bool,
    pub clsid: String,
}

fn read_configured_clsid(app: &AppHandle) -> Result<String, String> {
    let system_config = crate::config::get_system_config(app)?;
    system_config
        .get("driver")
        .and_then(|driver| driver.get("windows_com_clsid"))
        .and_then(|value| value.as_str())
        .map(|clsid| clsid.to_string())
        .ok_or_else(|| LogMessage::DriverClsidReadFailed("driver.windows_com_clsid missing from system.yml".to_string()).text())
}

fn clsid_registry_path(clsid: &str) -> Vec<u16> {
    format!("CLSID\\{clsid}\\InprocServer32")
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect()
}

fn is_clsid_registered(clsid: &str) -> bool {
    let path_wide = clsid_registry_path(clsid);
    let mut opened_key = HKEY::default();

    let open_result = unsafe { RegOpenKeyExW(HKEY_CLASSES_ROOT, PCWSTR(path_wide.as_ptr()), 0, KEY_READ, &mut opened_key) };
    if open_result != ERROR_SUCCESS {
        return false;
    }

    unsafe {
        let _ = RegCloseKey(opened_key);
    }
    true
}

fn poll_once(clsid: &str) {
    let currently_registered = is_clsid_registered(clsid);
    let was_registered = DRIVER_REGISTERED.swap(currently_registered, Ordering::SeqCst);

    if was_registered && !currently_registered {
        println!("{}", LogMessage::DriverRegistrationLost(clsid.to_string()).text());
    } else if !was_registered && currently_registered {
        println!("{}", LogMessage::DriverRegistrationRestored(clsid.to_string()).text());
    }
}

/// Starts the background poll loop. Called once from `main.rs`'s `.setup()`.
/// Logs once immediately if the filter is missing at startup, since that is
/// the most common real case (a fresh install where NSIS registration
/// failed or was skipped), then keeps polling to catch a mid-stream
/// unregister without adding any per-frame cost.
pub fn start(app: &AppHandle) {
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let clsid = match read_configured_clsid(&app_handle) {
            Ok(clsid) => clsid,
            Err(error) => {
                eprintln!("{error}");
                return;
            }
        };
        *CONFIGURED_CLSID.lock().unwrap() = clsid.clone();

        poll_once(&clsid);
        if !DRIVER_REGISTERED.load(Ordering::SeqCst) {
            println!("{}", LogMessage::DriverNotRegistered(clsid.clone()).text());
        }

        loop {
            tokio::time::sleep(Duration::from_secs(REGISTRY_POLL_INTERVAL_SECS)).await;
            poll_once(&clsid);
        }
    });
}

/// Synchronous, zero-I/O read of the last polled registration state.
/// `push_frame` checks this before handing the frame to Velo-Core so a
/// missing filter surfaces as a clean "reconnecting" state to the frontend
/// instead of a frame being written into shared memory that nothing reads.
pub fn is_registered() -> bool {
    DRIVER_REGISTERED.load(Ordering::SeqCst)
}

pub fn configured_clsid() -> String {
    CONFIGURED_CLSID.lock().unwrap().clone()
}

/// Read-only snapshot for the frontend's `get_driver_status` command. Kept
/// separate from `is_registered`/`configured_clsid` (used by the hot
/// `push_frame` path) so the Console UI's polling never needs to reason
/// about which internal accessor is safe to call from where.
pub fn status() -> DriverStatus {
    DriverStatus { registered: is_registered(), clsid: configured_clsid() }
}
