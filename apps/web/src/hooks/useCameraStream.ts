import { useEffect, useState } from 'react';

const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: 'environment', width: 1280, height: 720, frameRate: 30 },
  audio: false,
};

export function useCameraStream() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;
    let activeStream: MediaStream | null = null;

    navigator.mediaDevices
      .getUserMedia(CAMERA_CONSTRAINTS)
      .then((mediaStream) => {
        if (isCancelled) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }
        activeStream = mediaStream;
        setStream(mediaStream);
      })
      .catch(() => setError('[WEB] Camera access denied or unavailable'));

    return () => {
      isCancelled = true;
      activeStream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return { stream, error };
}
