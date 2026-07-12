import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

const TARGET_FPS = 30;
const FRAME_INTERVAL_MS = 1000 / TARGET_FPS;

function extractFrameBytes(video: HTMLVideoElement, canvas: HTMLCanvasElement): Uint8Array | null {
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  return new Uint8Array(imageData.data.buffer);
}

async function pushFrame(bytes: Uint8Array, width: number, height: number): Promise<void> {
  try {
    await invoke('push_frame', { bytes, width, height });
  } catch (error) {
    console.error('[WEB] push_frame invoke failed', error);
  }
}

export function useFramePusher(videoRef: React.RefObject<HTMLVideoElement | null>, isActive: boolean) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!isActive) return;

    canvasRef.current = document.createElement('canvas');
    const canvas = canvasRef.current;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startPushing = () => {
      const video = videoRef.current;
      if (!video || video.videoWidth === 0) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      intervalId = setInterval(() => {
        const bytes = extractFrameBytes(video, canvas);
        if (bytes) pushFrame(bytes, canvas.width, canvas.height);
      }, FRAME_INTERVAL_MS);
    };

    const video = videoRef.current;
    video?.addEventListener('loadedmetadata', startPushing);
    if (video && video.videoWidth > 0) startPushing();

    return () => {
      if (intervalId) clearInterval(intervalId);
      video?.removeEventListener('loadedmetadata', startPushing);
    };
  }, [videoRef, isActive]);
}
