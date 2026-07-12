pub enum LogMessage {
    EmptyBuffer,
    DimensionMismatch(usize, u32, u32),
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
}
