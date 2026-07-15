mod ffi;
mod log_messages;
mod rgba_to_nv12;
mod shared_memory_queue;

use log_messages::LogMessage;
use rgba_to_nv12::convert_rgba_to_nv12;
use shared_memory_queue::SharedMemoryQueue;
use std::sync::Mutex;

const RGBA_CHANNELS: u32 = 4;

static ACTIVE_QUEUE: Mutex<Option<SharedMemoryQueue>> = Mutex::new(None);

fn validate_frame_size(bytes: &[u8], width: u32, height: u32) -> Result<(), LogMessage> {
    if bytes.is_empty() {
        return Err(LogMessage::EmptyBuffer);
    }

    let expected_len = (width * height * RGBA_CHANNELS) as usize;
    if bytes.len() != expected_len {
        return Err(LogMessage::DimensionMismatch(bytes.len(), width, height));
    }

    Ok(())
}

fn queue_matches_dimensions(queue: &SharedMemoryQueue, expected_frame_size: usize) -> bool {
    queue.frame_capacity_bytes() == expected_frame_size
}

fn ensure_queue_ready(width: u32, height: u32, nv12_frame_size: usize) -> Result<(), LogMessage> {
    let mut guard = ACTIVE_QUEUE
        .lock()
        .map_err(|_| LogMessage::QueueNotInitialized)?;

    let needs_recreate = match guard.as_ref() {
        Some(queue) => !queue_matches_dimensions(queue, nv12_frame_size),
        None => true,
    };

    if needs_recreate {
        let queue = SharedMemoryQueue::create(width, height, nv12_frame_size)?;
        *guard = Some(queue);
    }

    Ok(())
}

fn write_to_queue(nv12_frame: &[u8]) -> Result<(), LogMessage> {
    let mut guard = ACTIVE_QUEUE
        .lock()
        .map_err(|_| LogMessage::QueueNotInitialized)?;

    let queue = guard.as_mut().ok_or(LogMessage::QueueNotInitialized)?;
    queue.write_frame(nv12_frame)
}

pub fn write_frame_buffer(bytes: &[u8], width: u32, height: u32) -> Result<(), LogMessage> {
    validate_frame_size(bytes, width, height)?;

    let nv12_frame = convert_rgba_to_nv12(bytes, width, height)?;
    ensure_queue_ready(width, height, nv12_frame.len())?;
    write_to_queue(&nv12_frame)
}
