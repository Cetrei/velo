import type { ConnectionState } from '../hooks/useWebRTC';
import type { RemotePeerInfo } from '../hooks/useWebRTC';

const PEER_LABELS: Record<RemotePeerInfo['role'], string> = {
  host: 'phone camera',
  viewer: 'desktop app',
};

interface ConnectionStatusPanelProps {
  connectionState: ConnectionState;
  remotePeer: RemotePeerInfo | null;
  onDisconnect: () => void;
}

function describeStatus(connectionState: ConnectionState, remotePeer: RemotePeerInfo | null): string {
  if (connectionState === 'connected' && remotePeer) {
    return `Connected to ${PEER_LABELS[remotePeer.role]}`;
  }
  if (connectionState === 'connecting') {
    return 'Waiting for the other device…';
  }
  if (connectionState === 'failed') {
    return 'Connection lost, retrying…';
  }
  return 'Disconnected';
}

export function ConnectionStatusPanel({ connectionState, remotePeer, onDisconnect }: ConnectionStatusPanelProps) {
  const isConnected = connectionState === 'connected' && remotePeer !== null;

  return (
    <div className="flex items-center gap-3 rounded-xl bg-velo-surface px-4 py-2">
      <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-velo-emerald' : 'bg-velo-coral'}`} />
      <span className="text-sm text-velo-text-secondary">{describeStatus(connectionState, remotePeer)}</span>
      {isConnected && (
        <button onClick={onDisconnect} className="text-sm text-velo-coral underline">
          Disconnect
        </button>
      )}
    </div>
  );
}
