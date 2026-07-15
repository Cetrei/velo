import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useWebRtc } from '../hooks/useWebRTC';
import { useFramePusher } from '../hooks/useFramePusher';
import { useConfig } from '../hooks/useConfig';
import { useUpdater } from '../hooks/useUpdater';
import { useServerUpdater } from '../hooks/useServerUpdater';
import { useSignalingUrl } from '../hooks/useSignalingUrl';
import { buildPairingUrl, createPairing } from '../lib/pairing';
import { resolveDesktopSections, type NavSectionId } from '../lib/navigation';
import { AppShell } from '../components/AppShell';
import { SettingsPanel } from '../components/SettingsPanel';
import { UpdatesTab } from '../components/UpdatesTab';
import { ConsolePanel } from '../components/ConsolePanel';
import { AboutPanel } from '../components/AboutPanel';
import { UpdateNotificationBanner } from '../components/UpdateNotificationBanner';
import { ConnectionStatusPanel } from '../components/ConnectionStatusPanel';

interface PairingState {
  roomId: string;
  otp: string;
}

function usePairingSession(signalingUrl: string) {
  const [pairing, setPairing] = useState<PairingState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const generate = useCallback(() => {
    setIsGenerating(true);
    setError(null);
    createPairing(signalingUrl)
      .then((response) => {
        setPairing({ roomId: response.roomId, otp: response.otp });
      })
      .catch((pairingError: unknown) => {
        console.error('[WEB] Failed to create pairing session', signalingUrl, pairingError);
        setError('Failed to create a pairing session. Check the signaling server.');
      })
      .finally(() => {
        setIsGenerating(false);
      });
  }, [signalingUrl]);

  const clear = useCallback(() => {
    setPairing(null);
    setError(null);
  }, []);

  return { pairing, error, isGenerating, generate, clear };
}

function StartPairingPrompt({ onStart, isGenerating }: { onStart: () => void; isGenerating: boolean }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl bg-velo-surface p-8 text-center">
      <p className="max-w-xs text-velo-text-secondary">
        Ready to connect your phone as a camera whenever you are.
      </p>
      <button
        onClick={onStart}
        disabled={isGenerating}
        className="rounded-xl bg-velo-indigo px-6 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        {isGenerating ? 'Getting your code…' : 'Connect a phone'}
      </button>
    </div>
  );
}

function PairingReadyPanel({
  pairingUrl,
  otp,
  onRegenerate,
  isGenerating,
}: {
  pairingUrl: string;
  otp: string;
  onRegenerate: () => void;
  isGenerating: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-velo-surface p-6">
      <QRCodeSVG value={pairingUrl} size={200} />
      <p className="text-sm text-velo-text-secondary">Scan with the Velo phone app to pair</p>
      <p className="text-xs text-velo-text-secondary">Or type this code on your phone:</p>
      <p className="text-2xl font-semibold tracking-widest text-velo-text-primary">{otp}</p>
      <p className="text-xs text-velo-text-secondary">Code expires in 2 minutes</p>
      <button
        onClick={onRegenerate}
        disabled={isGenerating}
        className="text-xs text-velo-indigo underline disabled:opacity-40"
      >
        {isGenerating ? 'Getting a new code…' : 'Get a new code'}
      </button>
    </div>
  );
}

export function Viewer() {
  const signalingUrl = useSignalingUrl();
  const [activeSection, setActiveSection] = useState<NavSectionId>('connect');
  const { pairing, error, isGenerating, generate, clear } = usePairingSession(signalingUrl);
  const { config } = useConfig();
  const devModeEnabled = config?.behavior.dev_mode_enabled ?? false;
  const desktopUpdater = useUpdater();
  const serverUpdater = useServerUpdater();
  const { runCheck: runDesktopUpdateCheck } = desktopUpdater;
  const { runCheck: runServerUpdateCheck } = serverUpdater;
  const hasUpdateBadge = desktopUpdater.status === 'ready' || serverUpdater.status === 'ready';
  const isAppUpdateInstalling = desktopUpdater.status === 'installing';
  const sections = resolveDesktopSections(devModeEnabled);

  const openUpdatesSection = useCallback(() => {
    setActiveSection('updates');
  }, []);

  const pairingUrl = useMemo(() => {
    if (!pairing) return null;
    return buildPairingUrl(window.location.origin + '/host', pairing.roomId, pairing.otp);
  }, [pairing]);

  const { connectionState, stage, stageDetail, remoteStream, remotePeer, disconnect } = useWebRtc({
    signalingUrl,
    roomId: pairing?.roomId ?? '',
    otp: pairing?.otp ?? '',
    role: 'viewer',
    isInitiator: false,
    connectionMode: config?.connection.mode,
    connectionConfig: config?.connection,
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current && remoteStream) {
      videoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const isConnected = connectionState === 'connected' && remotePeer !== null;
  const { deliveryState } = useFramePusher(videoRef, isConnected);

  useEffect(() => {
    if (connectionState !== 'failed') return;
    runDesktopUpdateCheck();
    runServerUpdateCheck();
  }, [connectionState, runDesktopUpdateCheck, runServerUpdateCheck]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    clear();
  }, [disconnect, clear]);

  function renderConnectSection() {
    return (
      <>
        {error && <p className="text-sm text-velo-coral">{error}</p>}
        {!pairing && !isConnected && !error && (
          <StartPairingPrompt onStart={generate} isGenerating={isGenerating} />
        )}
        {pairing && pairingUrl && !isConnected && (
          <PairingReadyPanel
            pairingUrl={pairingUrl}
            otp={pairing.otp}
            onRegenerate={generate}
            isGenerating={isGenerating}
          />
        )}
        {isConnected && (
          <video ref={videoRef} autoPlay playsInline className="w-full max-w-2xl rounded-2xl" />
        )}
        {pairing && (
          <ConnectionStatusPanel
            connectionState={connectionState}
            stage={stage}
            stageDetail={stageDetail}
            remotePeer={remotePeer}
            onDisconnect={handleDisconnect}
            driverReconnecting={deliveryState === 'reconnecting'}
          />
        )}
      </>
    );
  }

  function renderActiveSection() {
    if (activeSection === 'connect') return renderConnectSection();
    if (activeSection === 'settings') return <SettingsPanel />;
    if (activeSection === 'updates') return <UpdatesTab desktopUpdater={desktopUpdater} serverUpdater={serverUpdater} />;
    if (activeSection === 'console') return <ConsolePanel />;
    return <AboutPanel desktopVersion={desktopUpdater.currentVersion} backendVersion={serverUpdater.currentVersion} />;
  }

  return (
    <AppShell
      layout="sidebar"
      sections={sections}
      activeSection={activeSection}
      onSelectSection={setActiveSection}
      hasUpdateBadge={hasUpdateBadge}
      isBusy={isAppUpdateInstalling}
      busyLabel="Updating Velo, this only takes a moment\u2026"
    >
      {renderActiveSection()}
      <UpdateNotificationBanner isUpdateReady={hasUpdateBadge} onOpenUpdates={openUpdatesSection} />
    </AppShell>
  );
}
