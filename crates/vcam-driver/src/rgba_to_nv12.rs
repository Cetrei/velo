use crate::log_messages::LogMessage;

const RGBA_CHANNELS: usize = 4;

fn clamp_u8(value: i32) -> u8 {
    value.clamp(0, 255) as u8
}

fn rgb_to_luma(r: i32, g: i32, b: i32) -> u8 {
    clamp_u8((66 * r + 129 * g + 25 * b + 128) / 256 + 16)
}

fn rgb_to_chroma_u(r: i32, g: i32, b: i32) -> u8 {
    clamp_u8((-38 * r - 74 * g + 112 * b + 128) / 256 + 128)
}

fn rgb_to_chroma_v(r: i32, g: i32, b: i32) -> u8 {
    clamp_u8((112 * r - 94 * g - 18 * b + 128) / 256 + 128)
}

fn read_rgba_pixel(rgba: &[u8], index: usize) -> (i32, i32, i32) {
    let offset = index * RGBA_CHANNELS;
    (
        rgba[offset] as i32,
        rgba[offset + 1] as i32,
        rgba[offset + 2] as i32,
    )
}

fn write_luma_plane(rgba: &[u8], width: usize, height: usize, nv12: &mut [u8]) {
    for pixel_index in 0..(width * height) {
        let (r, g, b) = read_rgba_pixel(rgba, pixel_index);
        nv12[pixel_index] = rgb_to_luma(r, g, b);
    }
}

fn write_chroma_plane(rgba: &[u8], width: usize, height: usize, nv12: &mut [u8], luma_size: usize) {
    for chroma_row in 0..(height / 2) {
        for chroma_col in 0..(width / 2) {
            let source_index = (chroma_row * 2) * width + (chroma_col * 2);
            let (r, g, b) = read_rgba_pixel(rgba, source_index);

            let chroma_offset = luma_size + (chroma_row * width) + (chroma_col * 2);
            nv12[chroma_offset] = rgb_to_chroma_u(r, g, b);
            nv12[chroma_offset + 1] = rgb_to_chroma_v(r, g, b);
        }
    }
}

pub fn convert_rgba_to_nv12(rgba: &[u8], width: u32, height: u32) -> Result<Vec<u8>, LogMessage> {
    let width = width as usize;
    let height = height as usize;

    if width % 2 != 0 || height % 2 != 0 {
        return Err(LogMessage::Nv12ConversionFailed(
            "width and height must be even for 4:2:0 chroma subsampling".to_string(),
        ));
    }

    let luma_size = width * height;
    let chroma_size = luma_size / 2;
    let mut nv12 = vec![0u8; luma_size + chroma_size];

    write_luma_plane(rgba, width, height, &mut nv12);
    write_chroma_plane(rgba, width, height, &mut nv12, luma_size);

    Ok(nv12)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_produce_expected_buffer_size_when_dimensions_are_even() {
        let width = 4;
        let height = 2;
        let rgba = vec![0u8; (width * height * 4) as usize];

        let nv12 = convert_rgba_to_nv12(&rgba, width, height).unwrap();

        let expected_len = (width * height + (width * height) / 2) as usize;
        assert_eq!(nv12.len(), expected_len);
    }

    #[test]
    fn should_reject_odd_dimensions() {
        let rgba = vec![0u8; 3 * 3 * 4];

        let result = convert_rgba_to_nv12(&rgba, 3, 3);

        assert!(result.is_err());
    }

    #[test]
    fn should_convert_white_pixel_to_expected_luma() {
        let width = 2;
        let height = 2;
        let rgba = vec![255u8; (width * height * 4) as usize];

        let nv12 = convert_rgba_to_nv12(&rgba, width, height).unwrap();

        assert!(nv12[0] > 230);
    }
}
