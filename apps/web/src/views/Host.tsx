import { useEffect, useRef } from 'react';
import { useCameraStream } from '../hooks/useCameraStream';
import { useWebRtc } from '../hooks/useWebRTC';
import { getRoomIdFromUrl, getSignalingUrl } from '../lib/pairing';

function useWakeLock(): void {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    navigator.wakeLock?.request('screen').then((sentinel) => {
      lock = sentinel;
    }).catch(() => {
      console.warn('[WEB] Wake lock request failed, screen may sleep during streaming');
    });
    return () => {
      lock?.release();
    };
  }, []);
}

export function Host() {
  const { stream, error } = useCameraStream();
  const roomId = getRoomIdFromUrl();
  useWakeLock();

  const { connectionState } = useWebRtc({
    signalingUrl: getSignalingUrl(),
    roomId: roomId ?? '',
    isInitiator: true,
    localStream: stream,
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  if (!roomId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-velo-background text-velo-coral">
        <p>No pairing room found. Scan the QR code shown on the desktop app.</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-velo-background text-velo-coral">
        <p>{error}</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-velo-background text-velo-text-primary">
      <video ref={videoRef} autoPlay playsInline muted className="w-full max-w-sm rounded-2xl" />
      <span className="text-sm text-velo-text-secondary">{connectionState}</span>
    </main>
  );
}
