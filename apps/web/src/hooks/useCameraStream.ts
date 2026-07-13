import { useEffect, useState } from 'react';

const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: 'environment', width: 1280, height: 720, frameRate: 30 },
  audio: false,
};

const MAX_ACQUIRE_ATTEMPTS = 4;
const RETRY_DELAY_MS = 600;

const NON_RETRYABLE_ERROR_NAMES = new Set(['NotAllowedError', 'SecurityError']);

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireCameraWithRetry(
  isCancelled: () => boolean,
): Promise<MediaStream> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_ACQUIRE_ATTEMPTS; attempt += 1) {
    if (isCancelled()) {
      throw new DOMException('Cancelled', 'AbortError');
    }
    try {
      return await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
    } catch (error) {
      lastError = error;
      const errorName = error instanceof DOMException ? error.name : '';
      if (NON_RETRYABLE_ERROR_NAMES.has(errorName)) {
        throw error;
      }
      if (attempt < MAX_ACQUIRE_ATTEMPTS) {
        await wait(RETRY_DELAY_MS);
      }
    }
  }
  throw lastError;
}

function toErrorMessage(error: unknown): string {
  const errorName = error instanceof DOMException ? error.name : '';
  if (errorName === 'NotAllowedError' || errorName === 'SecurityError') {
    return '[WEB] Camera permission denied';
  }
  return '[WEB] Camera access denied or unavailable';
}

export function useCameraStream() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;
    let activeStream: MediaStream | null = null;

    acquireCameraWithRetry(() => isCancelled)
      .then((mediaStream) => {
        if (isCancelled) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }
        activeStream = mediaStream;
        setStream(mediaStream);
      })
      .catch((cameraError) => {
        if (isCancelled) return;
        setError(toErrorMessage(cameraError));
      });

    return () => {
      isCancelled = true;
      activeStream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return { stream, error };
}
