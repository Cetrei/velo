import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service';
import { useCameraStream } from '../hooks/useCameraStream';
import { useWebRtc } from '../hooks/useWebRTC';
import { getPairingFromUrl, getSignalingUrl } from '../lib/pairing';

const FOREGROUND_SERVICE_NOTIFICATION_ID = 1;

function useWakeLock(): void {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    navigator.wakeLock?.request('screen').then((sentinel) => {
      lock = sentinel;
    }).catch(() => {
      console.warn('[WEB] Wake lock request failed, screen may sleep during streaming');
    });

    if (Capacitor.isNativePlatform()) {
      KeepAwake.keepAwake().catch(() => {
        console.warn('[WEB] Native keep-awake request failed');
      });
    }

    return () => {
      lock?.release();
      if (Capacitor.isNativePlatform()) {
        KeepAwake.allowSleep().catch(() => {});
      }
    };
  }, []);
}

function useForegroundStreamingService(isStreaming: boolean): void {
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !isStreaming) {
      return;
    }

    ForegroundService.startForegroundService({
      id: FOREGROUND_SERVICE_NOTIFICATION_ID,
      title: 'Velo',
      body: 'Velo is streaming your camera',
      smallIcon: 'ic_launcher',
      silent: true,
    }).catch(() => {
      console.warn('[WEB] Failed to start foreground streaming service');
    });

    return () => {
      ForegroundService.stopForegroundService().catch(() => {});
    };
  }, [isStreaming]);
}

export function Host() {
  const { stream, error } = useCameraStream();
  const pairing = getPairingFromUrl();
  useWakeLock();

  const { connectionState } = useWebRtc({
    signalingUrl: getSignalingUrl(),
    roomId: pairing?.roomId ?? '',
    otp: pairing?.otp ?? '',
    isInitiator: true,
    localStream: stream,
  });

  useForegroundStreamingService(connectionState === 'connected');

  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  if (!pairing) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-velo-background text-velo-coral">
        <p>No pairing code found. Scan the QR code shown on the desktop app.</p>
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
