import type { ConnectionState, RemotePeerInfo, WebRtcStage } from '../hooks/useWebRTC';
import { getDeviceName } from '../lib/device-identity';

const PEER_LABELS: Record<RemotePeerInfo['role'], string> = {
  host: 'phone camera',
  viewer: 'desktop app',
};

interface ConnectionStatusPanelProps {
  connectionState: ConnectionState;
  stage?: WebRtcStage;
  stageDetail?: string;
  remotePeer: RemotePeerInfo | null;
  onDisconnect: () => void;
}

const STAGE_MESSAGES: Record<WebRtcStage, string> = {
  idle: 'Not connected',
  loadingConfig: 'Loading connection settings…',
  connectingSocket: 'Connecting to the signaling server…',
  joiningRoom: 'Joining the pairing room…',
  waitingForPeer: 'Waiting for the other device to join…',
  negotiating: 'Establishing the video connection…',
  connected: 'Connected',
  peerLeft: 'The other device disconnected',
  socketError: 'Could not reach the signaling server',
  failed: 'Connection failed',
};

function describeStatus(connectionState: ConnectionState, stage: WebRtcStage | undefined, remotePeer: RemotePeerInfo | null): string {
  if (connectionState === 'connected' && remotePeer) {
    return `Connected to ${remotePeer.deviceName} (${PEER_LABELS[remotePeer.role]})`;
  }
  if (stage) {
    return STAGE_MESSAGES[stage];
  }
  if (connectionState === 'connecting') {
    return 'Connecting…';
  }
  if (connectionState === 'failed') {
    return 'Connection failed';
  }
  return 'Disconnected';
}

function shouldShowDevicePairing(stage: WebRtcStage | undefined, remotePeer: RemotePeerInfo | null): boolean {
  if (!remotePeer) return false;
  return stage === 'negotiating' || stage === 'connected';
}

function DevicePairingRow({ remotePeer }: { remotePeer: RemotePeerInfo }) {
  const localDeviceName = getDeviceName();
  return (
    <div className="flex items-center gap-2 text-xs text-velo-text-secondary">
      <span className="rounded-md bg-velo-background px-2 py-0.5">{localDeviceName}</span>
      <span>↔</span>
      <span className="rounded-md bg-velo-background px-2 py-0.5">{remotePeer.deviceName}</span>
    </div>
  );
}

export function ConnectionStatusPanel({ connectionState, stage, stageDetail, remotePeer, onDisconnect }: ConnectionStatusPanelProps) {
  const isConnected = connectionState === 'connected' && remotePeer !== null;
  const isFailed = connectionState === 'failed';

  return (
    <div className="flex flex-col gap-1 rounded-xl bg-velo-surface px-4 py-2">
      <div className="flex items-center gap-3">
        <span
          className={`h-2 w-2 rounded-full ${isConnected ? 'bg-velo-emerald' : isFailed ? 'bg-velo-coral' : 'bg-velo-indigo animate-pulse'}`}
        />
        <span className="text-sm text-velo-text-secondary">{describeStatus(connectionState, stage, remotePeer)}</span>
        {isConnected && (
          <button onClick={onDisconnect} className="text-sm text-velo-coral underline">
            Disconnect
          </button>
        )}
      </div>
      {shouldShowDevicePairing(stage, remotePeer) && <DevicePairingRow remotePeer={remotePeer as RemotePeerInfo} />}
      {isFailed && stageDetail && <span className="text-xs text-velo-coral">{stageDetail}</span>}
    </div>
  );
}
