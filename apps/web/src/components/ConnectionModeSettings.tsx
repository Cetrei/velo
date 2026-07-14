import type { ConnectionConfig, ConnectionMode } from 'shared-types';

const CONNECTION_MODE_LABELS: Record<ConnectionMode, string> = {
  stun_p2p: 'Encrypted, direct (STUN)',
  cloudflare_relay: 'Unencrypted, via tunnel',
  usb: 'USB (coming soon)',
};

function StunP2pFields({
  connection,
  onChange,
}: {
  connection: ConnectionConfig;
  onChange: (next: ConnectionConfig) => void;
}) {
  const turn = connection.stun_p2p.turn;

  function updateTurnField(field: 'url' | 'username' | 'credential', value: string) {
    const nextTurn = { url: '', username: '', credential: '', ...turn, [field]: value };
    onChange({ ...connection, stun_p2p: { turn: nextTurn } });
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-velo-background p-3 text-xs text-velo-text-secondary">
      <p>Optional, your own TURN relay for aggressive NATs. Leave blank if you do not have one.</p>
      <input
        placeholder="turn:your-vps.example.com:3478"
        value={turn?.url ?? ''}
        onChange={(event) => updateTurnField('url', event.target.value)}
        className="rounded bg-velo-surface px-2 py-1 text-velo-text-primary"
      />
      <input
        placeholder="username"
        value={turn?.username ?? ''}
        onChange={(event) => updateTurnField('username', event.target.value)}
        className="rounded bg-velo-surface px-2 py-1 text-velo-text-primary"
      />
      <input
        placeholder="credential"
        type="password"
        value={turn?.credential ?? ''}
        onChange={(event) => updateTurnField('credential', event.target.value)}
        className="rounded bg-velo-surface px-2 py-1 text-velo-text-primary"
      />
    </div>
  );
}

function CloudflareRelayFields({
  connection,
  onChange,
}: {
  connection: ConnectionConfig;
  onChange: (next: ConnectionConfig) => void;
}) {
  function updateToken(value: string) {
    onChange({ ...connection, cloudflare_relay: { tunnel_token: value } });
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-velo-background p-3 text-xs text-velo-text-secondary">
      <p className="text-velo-coral">Video is not end to end encrypted in this mode, it is relayed through your tunnel.</p>
      <p>Cloudflare Tunnel token, from Zero Trust {'>'} Networks {'>'} Tunnels {'>'} Configure.</p>
      <input
        placeholder="tunnel token"
        type="password"
        value={connection.cloudflare_relay.tunnel_token}
        onChange={(event) => updateToken(event.target.value)}
        className="rounded bg-velo-surface px-2 py-1 text-velo-text-primary"
      />
    </div>
  );
}

export function ConnectionModeSettings({
  connection,
  onChange,
}: {
  connection: ConnectionConfig;
  onChange: (next: ConnectionConfig) => void;
}) {
  function updateMode(mode: ConnectionMode) {
    onChange({ ...connection, mode });
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center justify-between text-sm text-velo-text-secondary">
        Connection mode
        <select
          value={connection.mode}
          onChange={(event) => updateMode(event.target.value as ConnectionMode)}
          className="rounded bg-velo-background px-2 py-1 text-velo-text-primary"
        >
          {Object.entries(CONNECTION_MODE_LABELS).map(([mode, label]) => (
            <option key={mode} value={mode}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {connection.mode === 'stun_p2p' && <StunP2pFields connection={connection} onChange={onChange} />}
      {connection.mode === 'cloudflare_relay' && <CloudflareRelayFields connection={connection} onChange={onChange} />}
      {connection.mode === 'usb' && (
        <p className="rounded-xl bg-velo-background p-3 text-xs text-velo-text-secondary">
          USB connection is not implemented yet.
        </p>
      )}
    </div>
  );
}
