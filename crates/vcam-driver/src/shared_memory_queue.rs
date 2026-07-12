use crate::log_messages::LogMessage;
use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::System::Memory::{
    CreateFileMappingW, MapViewOfFile, FILE_MAP_ALL_ACCESS, MEMORY_MAPPED_VIEW_ADDRESS,
    PAGE_READWRITE,
};
use windows::core::PCWSTR;

// Layout mirrors OBS Studio's plugins/win-dshow/shared-memory-queue.h queue_header,
// which the obs-virtualsource.dll DirectShow filter expects verbatim regardless of
// which process is the writer. See docs/architecture.md for why this project writes
// to it directly instead of depending on OBS Studio being installed.
const QUEUE_HEADER_ALIGNMENT: usize = 32;
const FRAME_HEADER_SIZE: usize = 32;
const FRAME_BUFFER_COUNT: usize = 3;
const QUEUE_STATE_STOPPED: u32 = 0;
const QUEUE_STATE_READY: u32 = 2;
const VIDEO_QUEUE_NAME: &str = "OBSVirtualCamVideo";

#[repr(C)]
struct QueueHeader {
    write_idx: u32,
    read_idx: u32,
    state: u32,
    offsets: [u32; FRAME_BUFFER_COUNT],
    frame_type: u32,
    width: u32,
    height: u32,
    interval_100ns: u64,
    reserved: [u32; 8],
}

pub struct SharedMemoryQueue {
    mapping_handle: HANDLE,
    view: MEMORY_MAPPED_VIEW_ADDRESS,
    frame_offsets: [usize; FRAME_BUFFER_COUNT],
    frame_capacity: usize,
    next_write_slot: usize,
}

fn align_up(size: usize, alignment: usize) -> usize {
    (size + (alignment - 1)) & !(alignment - 1)
}

fn compute_layout(frame_size: usize) -> (usize, [usize; FRAME_BUFFER_COUNT]) {
    let mut offsets = [0usize; FRAME_BUFFER_COUNT];
    let mut cursor = align_up(std::mem::size_of::<QueueHeader>(), QUEUE_HEADER_ALIGNMENT);

    for slot in offsets.iter_mut() {
        *slot = cursor;
        cursor = align_up(cursor + frame_size + FRAME_HEADER_SIZE, QUEUE_HEADER_ALIGNMENT);
    }

    (cursor, offsets)
}

fn queue_name_wide() -> Vec<u16> {
    VIDEO_QUEUE_NAME
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect()
}

fn create_file_mapping(total_size: usize) -> Result<HANDLE, String> {
    let name_wide = queue_name_wide();

    let handle = unsafe {
        CreateFileMappingW(
            windows::Win32::Foundation::INVALID_HANDLE_VALUE,
            None,
            PAGE_READWRITE,
            0,
            total_size as u32,
            PCWSTR(name_wide.as_ptr()),
        )
    };

    handle.map_err(|error| LogMessage::QueueCreateFailed(error.code().0 as u32).text())
}

fn map_view(handle: HANDLE, total_size: usize) -> Result<MEMORY_MAPPED_VIEW_ADDRESS, String> {
    let view = unsafe { MapViewOfFile(handle, FILE_MAP_ALL_ACCESS, 0, 0, total_size) };

    if view.Value.is_null() {
        let error = windows::core::Error::from_win32();
        return Err(LogMessage::QueueMapFailed(error.code().0 as u32).text());
    }

    Ok(view)
}

fn header_ptr(view: MEMORY_MAPPED_VIEW_ADDRESS) -> *mut QueueHeader {
    view.Value as *mut QueueHeader
}

fn write_header_metadata(view: MEMORY_MAPPED_VIEW_ADDRESS, width: u32, height: u32, offsets: [usize; FRAME_BUFFER_COUNT]) {
    let header = header_ptr(view);
    unsafe {
        (*header).write_idx = 0;
        (*header).read_idx = 0;
        (*header).state = QUEUE_STATE_READY;
        (*header).offsets = [offsets[0] as u32, offsets[1] as u32, offsets[2] as u32];
        (*header).frame_type = 0;
        (*header).width = width;
        (*header).height = height;
        (*header).interval_100ns = 0;
        (*header).reserved = [0; 8];
    }
}

impl SharedMemoryQueue {
    pub fn create(width: u32, height: u32, frame_size: usize) -> Result<Self, String> {
        let (total_size, frame_offsets) = compute_layout(frame_size);
        let mapping_handle = create_file_mapping(total_size)?;
        let view = map_view(mapping_handle, total_size)?;

        write_header_metadata(view, width, height, frame_offsets);

        Ok(Self {
            mapping_handle,
            view,
            frame_offsets,
            frame_capacity: frame_size,
            next_write_slot: 0,
        })
    }

    pub fn frame_capacity_bytes(&self) -> usize {
        self.frame_capacity
    }

    fn frame_slot_ptr(&self, slot_index: usize) -> *mut u8 {
        let base = self.view.Value as *mut u8;
        unsafe { base.add(self.frame_offsets[slot_index] + FRAME_HEADER_SIZE) }
    }

    pub fn write_frame(&mut self, nv12_frame: &[u8]) -> Result<(), String> {
        if nv12_frame.len() != self.frame_capacity {
            return Err(LogMessage::Nv12ConversionFailed(format!(
                "frame size {} does not match queue capacity {}",
                nv12_frame.len(),
                self.frame_capacity
            ))
            .text());
        }

        let slot = self.next_write_slot;
        let destination = self.frame_slot_ptr(slot);

        unsafe {
            std::ptr::copy_nonoverlapping(nv12_frame.as_ptr(), destination, nv12_frame.len());
            let header = header_ptr(self.view);
            (*header).write_idx = slot as u32;
        }

        self.next_write_slot = (slot + 1) % FRAME_BUFFER_COUNT;
        Ok(())
    }
}

impl Drop for SharedMemoryQueue {
    fn drop(&mut self) {
        unsafe {
            let header = header_ptr(self.view);
            (*header).state = QUEUE_STATE_STOPPED;
            let _ = windows::Win32::System::Memory::UnmapViewOfFile(self.view);
            let _ = CloseHandle(self.mapping_handle);
        }
    }
}

unsafe impl Send for SharedMemoryQueue {}
