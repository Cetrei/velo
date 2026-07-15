use crate::log_messages::LogMessage;
use crate::write_frame_buffer;

/// Bumped only when an exported function's signature or memory layout
/// changes in a way that would corrupt memory if a mismatched shell/core
/// pair called into each other. The shell (`apps/desktop/src/core_loader.rs`)
/// reads this symbol via `libloading` and refuses to call any other
/// exported function on a mismatch, rolling back to the previously
/// installed Velo-Core `.dll` instead. This is a `static`, not a function,
/// so the shell can read it without risking a call into code built against
/// an incompatible layout. See `TODO.md` Phase 4.
#[unsafe(no_mangle)]
pub static CORE_ABI_VERSION: u32 = 1;

/// Writes one RGBA frame into the virtual camera's shared memory queue.
///
/// Returns `0` on success, or a positive error code from
/// `LogMessage::code` on failure. The full English reason is logged to
/// stderr on this side of the boundary; only the stable numeric code
/// crosses the FFI boundary itself, since a `String` cannot safely cross a
/// C ABI without extra allocation-ownership machinery this crate does not
/// need yet. The desktop Console UI keeps its own mirror of the code table
/// to render a readable reason from the bare number.
///
/// # Safety
/// `bytes` must point to a valid, readable buffer of at least `len` bytes
/// for the duration of this call. The caller owns that buffer and must not
/// free or mutate it concurrently with this call. Passing a null `bytes`
/// pointer with a nonzero `len` is undefined behavior in the underlying
/// slice construction; this function checks for null first and returns
/// `LogMessage::EmptyBuffer`'s code instead of dereferencing it.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn velo_core_write_frame(
    bytes: *const u8,
    len: usize,
    width: u32,
    height: u32,
) -> i32 {
    if bytes.is_null() {
        return LogMessage::EmptyBuffer.code();
    }

    let frame = unsafe { std::slice::from_raw_parts(bytes, len) };
    match write_frame_buffer(frame, width, height) {
        Ok(()) => 0,
        Err(error) => {
            eprintln!("{}", error.text());
            error.code()
        }
    }
}
