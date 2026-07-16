import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service';
import type { ConnectionConfig } from 'shared-types';
import { useCameraStream } from '../hooks/useCameraStream';
import { useWebRtc } from '../hooks/useWebRTC';
import { useDeepLinkPairing } from '../hooks/useDeepLinkPairing';
import { useLocalConnectionConfig } from '../hooks/useLocalConnectionConfig';
import { useLocalDevMode } from '../hooks/useLocalDevMode';
import { useAndroidUpdater } from '../hooks/useAndroidUpdater';
import { getSignalingUrl, type PairingFromUrl } from '../lib/pairing';
import { resolveMobileSections, type NavSectionId } from '../lib/navigation';
import { getLocalDeviceCapability, describeUnsupportedRole } from '../lib/role-capability';
import { AppShell } from '../components/AppShell';
import { PairingCodeEntry } from '../components/PairingCodeEntry';
import { ConnectionStatusPanel } from '../components/ConnectionStatusPanel';
import { UpdatesTab } from '../components/UpdatesTab';
import { ConsolePanel } from '../components/ConsolePanel';
import { AboutPanel } from '../components/AboutPanel';
import { UpdateNotificationBanner } from '../components/UpdateNotificationBanner';

const FOREGROUND_SERVICE_NOTIFICATION_ID = 1;
const HOST_VIEW_ROLE = 'host' as const;

// TODO-ARCH: connection.mode (STUN/TURN/relay) is still read from device-local storage via
// useLocalConnectionConfig instead of being handed to the phone by Desktop during pairing.
// The spec now wants Settings hidden entirely on mobile and this exchanged automatically over
// the QR/code pairing handshake instead, which means extending SignalingPayload plus the
// pairing REST response in apps/server to carry ConnectionConfig, and having useDeepLinkPairing
// and PairingCodeEntry store what Desktop sends. That is a signaling protocol change, not a UI
// change, so flagging for Architect rather than doing it unilaterally in this pass. Until then
// this hook keeps using whatever was last saved locally (defaults to stun_p2p).

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

function UnsupportedRolePanel({ onExit }: { onExit: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-velo-background px-6 text-center text-velo-text-secondary">
      <p className="max-w-sm">{describeUnsupportedRole(HOST_VIEW_ROLE)}</p>
      <button onClick={onExit} className="text-sm text-velo-indigo underline">
        Go back
      </button>
    </main>
  );
}

export function StreamingView({
  pairing,
  connection,
  onExit,
}: {
  pairing: PairingFromUrl;
  connection: ConnectionConfig;
  onExit: () => void;
}) {
  const { stream, error } = useCameraStream();
  useWakeLock();

  const { connectionState, stage, stageDetail, remotePeer, negotiatedRole, disconnect, swapRole } = useWebRtc({
    signalingUrl: getSignalingUrl(),
    roomId: pairing.roomId,
    otp: pairing.otp,
    role: HOST_VIEW_ROLE,
    localStream: stream,
    readyToJoin: stream !== null,
    connectionMode: connection.mode,
    connectionConfig: connection,
  });

  useForegroundStreamingService(connectionState === 'connected');

  const { runCheck: runAndroidUpdateCheck } = useAndroidUpdater();
  useEffect(() => {
    if (connectionState !== 'failed') return;
    runAndroidUpdateCheck();
  }, [connectionState, runAndroidUpdateCheck]);

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

  if (stage === 'roleMismatch') {
    return <UnsupportedRolePanel onExit={handleDisconnect} />;
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-velo-background text-velo-coral">
        <p>{error}</p>
      </main>
    );
  }

  if (!stream) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-velo-background text-velo-text-secondary">
        <p>Waiting for the camera to become available…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-velo-background text-velo-text-primary">
      <video ref={videoRef} autoPlay playsInline muted className="w-full max-w-sm rounded-2xl" />
      <ConnectionStatusPanel
        connectionState={connectionState}
        stage={stage}
        stageDetail={stageDetail}
        remotePeer={remotePeer}
        onDisconnect={handleDisconnect}
        negotiatedRole={negotiatedRole}
        onSwapRole={swapRole}
      />
    </main>
  );
}

function IdleHostShell({ onPaired }: { onPaired: (pairing: PairingFromUrl) => void }) {
  const [activeSection, setActiveSection] = useState<NavSectionId>('connect');
  const { isDevModeEnabled, setDevModeEnabled, isLoaded } = useLocalDevMode();
  const androidUpdater = useAndroidUpdater();
  const hasUpdateBadge = androidUpdater.status === 'ready';
  const isUpdateInstalling = androidUpdater.status === 'downloading' || androidUpdater.status === 'installing';
  const sections = resolveMobileSections(isDevModeEnabled);

  const openUpdatesSection = useCallback(() => {
    setActiveSection('updates');
  }, []);

  function renderActiveSection() {
    if (activeSection === 'connect') return <PairingCodeEntry signalingUrl={getSignalingUrl()} onPaired={onPaired} />;
    if (activeSection === 'updates') return <UpdatesTab androidUpdater={androidUpdater} />;
    if (activeSection === 'console') return <ConsolePanel />;
    return (
      <AboutPanel
        androidVersion={androidUpdater.currentVersion}
        isDevModeEnabled={isLoaded ? isDevModeEnabled : false}
        onDevModeChange={setDevModeEnabled}
      />
    );
  }

  return (
    <AppShell
      layout="tabbar"
      sections={sections}
      activeSection={activeSection}
      onSelectSection={setActiveSection}
      hasUpdateBadge={hasUpdateBadge}
      isBusy={isUpdateInstalling}
      busyLabel="Installing the Android app update…"
    >
      {renderActiveSection()}
      <UpdateNotificationBanner isUpdateReady={hasUpdateBadge} onOpenUpdates={openUpdatesSection} />
    </AppShell>
  );
}

export function Host() {
  const { pairing: deepLinkPairing, reset: resetDeepLinkPairing } = useDeepLinkPairing();
  const [manualPairing, setManualPairing] = useState<PairingFromUrl | null>(null);
  const { connection, isLoaded } = useLocalConnectionConfig();
  const pairing = deepLinkPairing ?? manualPairing;

  const handleExit = useCallback(() => {
    resetDeepLinkPairing();
    setManualPairing(null);
  }, [resetDeepLinkPairing]);

  if (!isLoaded) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-velo-background text-velo-text-secondary">
        <p>Loading connection settings…</p>
      </main>
    );
  }

  if (!getLocalDeviceCapability().canCapture) {
    return <UnsupportedRolePanel onExit={handleExit} />;
  }

  if (pairing) {
    return <StreamingView pairing={pairing} connection={connection} onExit={handleExit} />;
  }

  return <IdleHostShell onPaired={setManualPairing} />;
}
