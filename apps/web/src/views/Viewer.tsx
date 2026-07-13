import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useWebRtc } from '../hooks/useWebRTC';
import { useFramePusher } from '../hooks/useFramePusher';
import { buildPairingUrl, createPairing, getSignalingUrl } from '../lib/pairing';
import { SettingsPanel } from '../components/SettingsPanel';
import { UpdateBanner } from '../components/UpdateBanner';
import { ConnectionStatusPanel } from '../components/ConnectionStatusPanel';
import { DevStageLogPanel } from '../components/DevStageLogPanel';

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
      .catch(() => {
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
  const signalingUrl = useMemo(() => getSignalingUrl(), []);
  const [showSettings, setShowSettings] = useState(false);
  const { pairing, error, isGenerating, generate, clear } = usePairingSession(signalingUrl);

  const pairingUrl = useMemo(() => {
    if (!pairing) return null;
    return buildPairingUrl(window.location.origin + '/host', pairing.roomId, pairing.otp);
  }, [pairing]);

  const { connectionState, stage, stageDetail, remoteStream, remotePeer, stageHistory, disconnect } = useWebRtc({
    signalingUrl,
    roomId: pairing?.roomId ?? '',
    otp: pairing?.otp ?? '',
    role: 'viewer',
    isInitiator: false,
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current && remoteStream) {
      videoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const isConnected = connectionState === 'connected' && remotePeer !== null;
  useFramePusher(videoRef, isConnected);

  const handleDisconnect = useCallback(() => {
    disconnect();
    clear();
  }, [disconnect, clear]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-velo-background text-velo-text-primary">
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
      <div className="flex items-center gap-3">
        {pairing && (
          <ConnectionStatusPanel
            connectionState={connectionState}
            stage={stage}
            stageDetail={stageDetail}
            remotePeer={remotePeer}
            onDisconnect={handleDisconnect}
          />
        )}
        <button
          onClick={() => setShowSettings((value) => !value)}
          className="text-sm text-velo-indigo underline"
        >
          Settings
        </button>
      </div>
      {showSettings && <SettingsPanel />}
      <DevStageLogPanel stageHistory={stageHistory} />
      <UpdateBanner />
    </main>
  );
}
