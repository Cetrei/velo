import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

const TARGET_FPS = 30;
const FRAME_INTERVAL_MS = 1000 / TARGET_FPS;

// push_frame fails on every single frame while the virtual camera driver is
// unregistered, which would otherwise flood the console at 30 logs/sec. The
// frame loop keeps retrying every interval regardless (that retry is what
// lets delivery resume the moment the driver becomes available again), this
// only throttles how often the failure itself gets logged.
const DRIVER_ERROR_LOG_INTERVAL_MS = 3000;

function extractFrameBytes(video: HTMLVideoElement, canvas: HTMLCanvasElement): Uint8Array | null {
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  return new Uint8Array(imageData.data.buffer);
}

export type FrameDeliveryState = 'delivering' | 'reconnecting';

async function pushFrame(
  bytes: Uint8Array,
  width: number,
  height: number,
  lastLoggedAtRef: React.RefObject<number>,
  onDeliveryStateChange: (state: FrameDeliveryState) => void,
): Promise<void> {
  try {
    await invoke('push_frame', { bytes, width, height });
    onDeliveryStateChange('delivering');
  } catch (error) {
    onDeliveryStateChange('reconnecting');
    const now = Date.now();
    if (now - lastLoggedAtRef.current < DRIVER_ERROR_LOG_INTERVAL_MS) return;
    lastLoggedAtRef.current = now;
    console.error('[WEB] push_frame invoke failed, retrying automatically', error);
  }
}

// Pushes decoded WebRTC frames into the Rust backend at TARGET_FPS and
// reports whether frame delivery is currently succeeding. The retry loop
// itself needs no special handling: the same setInterval that pushes a
// frame every ~33ms already retries on the very next tick after a failure,
// so recovery (e.g. the virtual camera driver becoming registered again
// mid-stream) is automatic. This return value only exists so the UI can
// show a Reconnecting state to the user instead of failures being
// silently swallowed, per TODO.md's driver registration flag.
export function useFramePusher(videoRef: React.RefObject<HTMLVideoElement | null>, isActive: boolean) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastLoggedAtRef = useRef(0);
  const [deliveryState, setDeliveryState] = useState<FrameDeliveryState>('delivering');

  const handleDeliveryStateChange = useCallback((state: FrameDeliveryState) => {
    setDeliveryState((previous) => (previous === state ? previous : state));
  }, []);

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
        if (bytes) pushFrame(bytes, canvas.width, canvas.height, lastLoggedAtRef, handleDeliveryStateChange);
      }, FRAME_INTERVAL_MS);
    };

    const video = videoRef.current;
    video?.addEventListener('loadedmetadata', startPushing);
    if (video && video.videoWidth > 0) startPushing();

    return () => {
      if (intervalId) clearInterval(intervalId);
      video?.removeEventListener('loadedmetadata', startPushing);
    };
  }, [videoRef, isActive, handleDeliveryStateChange]);

  return { deliveryState };
}
