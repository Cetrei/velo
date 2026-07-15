#[derive(Debug)]
pub enum LogMessage {
    EmptyBuffer,
    DimensionMismatch(usize, u32, u32),
    // Resolved: the registration check does not live here. A per-frame
    // registry lookup at 30fps would add real I/O latency to this crate's
    // hot write path, and the mid-stream unregister case needs a
    // background poll loop with its own lifecycle (start once at app
    // setup, keep running independent of any single frame call), which
    // belongs in the shell, not in a low-level driver crate with no
    // concept of app startup. See apps/desktop/src/driver_watchdog.rs:
    // it polls the CLSID every few seconds and caches the result in an
    // atomic the shell's push_frame checks before ever reaching this
    // crate, so write_frame_buffer is skipped entirely while nothing is
    // registered instead of writing frames nothing reads. This variant is
    // kept as dead code since vcam-driver itself still has no reason to
    // detect this condition on its own.
    #[allow(dead_code)]
    BackendNotRegistered,
    QueueCreateFailed(u32),
    QueueMapFailed(u32),
    QueueNotInitialized,
    Nv12ConversionFailed(String),
}

impl LogMessage {
    pub fn text(&self) -> String {
        match self {
            LogMessage::EmptyBuffer => {
                "[VCAM_DRIVER] Received an empty frame buffer".to_string()
            }
            LogMessage::DimensionMismatch(actual_len, width, height) => {
                format!(
                    "[VCAM_DRIVER] Buffer length {actual_len} does not match {width}x{height} RGBA frame size"
                )
            }
            LogMessage::BackendNotRegistered => {
                "[VCAM_DRIVER] No virtual camera backend registered, dropping frame".to_string()
            }
            LogMessage::QueueCreateFailed(win32_error) => {
                format!(
                    "[VCAM_DRIVER] CreateFileMappingW failed with Win32 error {win32_error}"
                )
            }
            LogMessage::QueueMapFailed(win32_error) => {
                format!("[VCAM_DRIVER] MapViewOfFile failed with Win32 error {win32_error}")
            }
            LogMessage::QueueNotInitialized => {
                "[VCAM_DRIVER] Shared memory queue was not initialized before write".to_string()
            }
            LogMessage::Nv12ConversionFailed(reason) => {
                format!("[VCAM_DRIVER] RGBA to NV12 conversion failed: {reason}")
            }
        }
    }

    /// Stable numeric identity for this error, independent of the English
    /// text in `text()`. This is what actually crosses the FFI boundary in
    /// `ffi.rs`, since a `String` cannot safely cross a C ABI without extra
    /// machinery this crate does not need yet. The desktop Console UI keeps
    /// its own mirror of this table to render a readable reason from the
    /// bare number; if a variant is added, removed, or renumbered here,
    /// that TS-side mirror must be updated in the same change or the
    /// Console will show an unrecognized code for a real error.
    pub fn code(&self) -> i32 {
        match self {
            LogMessage::EmptyBuffer => 1,
            LogMessage::DimensionMismatch(_, _, _) => 2,
            LogMessage::BackendNotRegistered => 3,
            LogMessage::QueueCreateFailed(_) => 4,
            LogMessage::QueueMapFailed(_) => 5,
            LogMessage::QueueNotInitialized => 6,
            LogMessage::Nv12ConversionFailed(_) => 7,
        }
    }
}
