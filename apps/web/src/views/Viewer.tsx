import { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useWebRtc } from '../hooks/useWebRTC';
import { useFramePusher } from '../hooks/useFramePusher';
import { buildPairingUrl, generateRoomId, getSignalingUrl } from '../lib/pairing';
import { SettingsPanel } from '../components/SettingsPanel';

export function Viewer() {
  const [roomId] = useState(() => generateRoomId());
  const [showSettings, setShowSettings] = useState(false);
  const signalingUrl = useMemo(() => getSignalingUrl(), []);

  const pairingUrl = useMemo(
    () => buildPairingUrl(window.location.origin + '/host', roomId),
    [roomId],
  );

  const { connectionState, remoteStream } = useWebRtc({
    signalingUrl,
    roomId,
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

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-velo-background text-velo-text-primary">
      {!isConnected && (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-velo-surface p-6">
          <QRCodeSVG value={pairingUrl} size={200} />
          <p className="text-sm text-velo-text-secondary">Scan with Velo Mobile to pair</p>
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
    </main>
  );
}
