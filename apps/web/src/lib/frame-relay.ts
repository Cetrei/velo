const RELAY_JPEG_QUALITY = 0.75;

export interface RelayFrame {
  bytes: ArrayBuffer;
  width: number;
  height: number;
}

function drawVideoToCanvas(video: HTMLVideoElement, canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  if (video.videoWidth === 0 || video.videoHeight === 0) return null;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const context = canvas.getContext('2d');
  if (!context) return null;

  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return context;
}

export async function captureJpegFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement): Promise<RelayFrame | null> {
  const context = drawVideoToCanvas(video, canvas);
  if (!context) return null;

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', RELAY_JPEG_QUALITY);
  });
  if (!blob) return null;

  const bytes = await blob.arrayBuffer();
  return { bytes, width: canvas.width, height: canvas.height };
}

export async function drawJpegFrameToCanvas(canvas: HTMLCanvasElement, bytes: ArrayBuffer): Promise<void> {
  const blob = new Blob([bytes], { type: 'image/jpeg' });
  const bitmap = await createImageBitmap(blob);

  if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
  }

  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    return;
  }

  context.drawImage(bitmap, 0, 0);
  bitmap.close();
}
