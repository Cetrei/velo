import { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useWebRtc } from '../hooks/useWebRTC';
import { useFramePusher } from '../hooks/useFramePusher';
import { buildPairingUrl, createPairing, getSignalingUrl } from '../lib/pairing';
import { SettingsPanel } from '../components/SettingsPanel';
import { UpdateBanner } from '../components/UpdateBanner';

interface PairingState {
  roomId: string;
  otp: string;
}

function usePairingSession(signalingUrl: string) {
  const [pairing, setPairing] = useState<PairingState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;
    createPairing(signalingUrl)
      .then((response) => {
        if (!isCancelled) setPairing({ roomId: response.roomId, otp: response.otp });
      })
      .catch(() => {
        if (!isCancelled) setError('Failed to create a pairing session. Check the signaling server.');
      });
    return () => {
      isCancelled = true;
    };
  }, [signalingUrl]);

  return { pairing, error };
}

export function Viewer() {
  const signalingUrl = useMemo(() => getSignalingUrl(), []);
  const [showSettings, setShowSettings] = useState(false);
  const { pairing, error } = usePairingSession(signalingUrl);

  const pairingUrl = useMemo(() => {
    if (!pairing) return null;
    return buildPairingUrl(window.location.origin + '/host', pairing.roomId, pairing.otp);
  }, [pairing]);

  const { connectionState, remoteStream } = useWebRtc({
    signalingUrl,
    roomId: pairing?.roomId ?? '',
    otp: pairing?.otp ?? '',
    isInitiator: false,
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current && remoteStream) {
      videoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const isConnected = connectionState === 'connected';
  useFramePusher(videoRef, isConnected);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-velo-background text-velo-coral">
        <p>{error}</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-velo-background text-velo-text-primary">
      {!isConnected && pairingUrl && (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-velo-surface p-6">
          <QRCodeSVG value={pairingUrl} size={200} />
          <p className="text-sm text-velo-text-secondary">Scan with Velo Mobile to pair</p>
          <p className="text-xs text-velo-text-secondary">Code expires in 2 minutes</p>
        </div>
      )}
      {isConnected && (
        <video ref={videoRef} autoPlay playsInline className="w-full max-w-2xl rounded-2xl" />
      )}
      <div className="flex items-center gap-3">
        <span className="text-sm text-velo-text-secondary">{connectionState}</span>
        <button
          onClick={() => setShowSettings((value) => !value)}
          className="text-sm text-velo-indigo underline"
        >
          Settings
        </button>
      </div>
      {showSettings && <SettingsPanel />}
      <UpdateBanner />
    </main>
  );
}
