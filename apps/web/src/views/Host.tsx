import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service';
import { useCameraStream } from '../hooks/useCameraStream';
import { useWebRtc } from '../hooks/useWebRTC';
import { useDeepLinkPairing } from '../hooks/useDeepLinkPairing';
import { getSignalingUrl, type PairingFromUrl } from '../lib/pairing';
import { PairingCodeEntry } from '../components/PairingCodeEntry';
import { ConnectionStatusPanel } from '../components/ConnectionStatusPanel';

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

export function StreamingView({ pairing, onExit }: { pairing: PairingFromUrl; onExit: () => void }) {
  const { stream, error } = useCameraStream();
  useWakeLock();

  const { connectionState, remotePeer, disconnect } = useWebRtc({
    signalingUrl: getSignalingUrl(),
    roomId: pairing.roomId,
    otp: pairing.otp,
    role: 'host',
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

  const handleDisconnect = useCallback(() => {
    disconnect();
    onExit();
  }, [disconnect, onExit]);

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
      <ConnectionStatusPanel
        connectionState={connectionState}
        remotePeer={remotePeer}
        onDisconnect={handleDisconnect}
      />
    </main>
  );
}

export function Host() {
  const { pairing: deepLinkPairing, reset: resetDeepLinkPairing } = useDeepLinkPairing();
  const [manualPairing, setManualPairing] = useState<PairingFromUrl | null>(null);
  const pairing = deepLinkPairing ?? manualPairing;

  const handleExit = useCallback(() => {
    resetDeepLinkPairing();
    setManualPairing(null);
  }, [resetDeepLinkPairing]);

  if (!pairing) {
    return <PairingCodeEntry signalingUrl={getSignalingUrl()} onPaired={setManualPairing} />;
  }

  return <StreamingView pairing={pairing} onExit={handleExit} />;
}
