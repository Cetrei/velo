import { useState } from 'react';
import { Copy, Check, Play, Square, RotateCw, Loader2 } from 'lucide-react';
import { useBackendUpdater } from '../hooks/useBackendUpdater';
import { useTunnelStatus } from '../hooks/useTunnelStatus';
import { useConfig } from '../hooks/useConfig';
import { getClientEnvironment } from '../lib/environment';
import { describeProgressPhase, progressPhaseFraction, type UpdateProgressEvent } from '../hooks/useUpdateProgress';
import { DevLogList } from './DevLogList';

type ConsoleTabId = 'app' | 'backend' | 'tunnel';

function useCopyToClipboard(): [boolean, (text: string) => void] {
  const [didCopy, setDidCopy] = useState(false);

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setDidCopy(true);
      setTimeout(() => setDidCopy(false), 1500);
    }).catch((copyError) => {
      console.error('[CONSOLE_PANEL] failed to copy status text to clipboard', copyError);
    });
  }

  return [didCopy, copy];
}

function CopyButton({ text }: { text: string }) {
  const [didCopy, copyToClipboard] = useCopyToClipboard();

  return (
    <button onClick={() => copyToClipboard(text)} className="flex items-center gap-1 text-xs text-velo-indigo underline">
      {didCopy ? <Check size={12} /> : <Copy size={12} />}
      {didCopy ? 'Copied' : 'Copy'}
    </button>
  );
}

function StatusBlock({ title, text, note, children }: { title: string; text: string; note: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-velo-background p-3 font-mono text-xs text-velo-text-primary">
      <div className="flex items-center justify-between">
        <span className="text-velo-text-secondary">{title}</span>
        <CopyButton text={text} />
      </div>
      <p className="whitespace-pre-wrap break-words">{text}</p>
      {children}
      <p className="text-velo-text-secondary">{note}</p>
    </div>
  );
}

function ProgressBar({ progress }: { progress: UpdateProgressEvent | null }) {
  if (!progress || progress.phase === 'done' || progress.phase === 'failed') return null;
  const fraction = progressPhaseFraction(progress);
  const label = describeProgressPhase(progress);

  return (
    <div className="flex flex-col gap-1 font-sans">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-velo-surface">
        <div
          className="h-full rounded-full bg-velo-indigo transition-all duration-300"
          style={{ width: `${Math.max(4, Math.min(100, (fraction ?? 0) * 100))}%` }}
        />
      </div>
      <span className="text-velo-text-secondary">{label}</span>
    </div>
  );
}

interface ProcessControlsProps {
  isRunning: boolean;
  isBusy: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onStart?: () => void;
  onStop: () => void;
  onRestart: () => void;
}

function ProcessControlButton({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="flex h-7 w-7 items-center justify-center rounded-lg bg-velo-surface text-velo-text-secondary transition-colors hover:text-velo-text-primary disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function ProcessControls({ isRunning, isBusy, disabled, disabledReason, onStart, onStop, onRestart }: ProcessControlsProps) {
  const isDisabled = Boolean(disabled) || isBusy;

  return (
    <div className="flex items-center gap-1.5" title={disabled ? disabledReason : undefined}>
      {isBusy ? (
        <ProcessControlButton onClick={() => {}} disabled title="Working…">
          <Loader2 size={14} className="animate-spin" />
        </ProcessControlButton>
      ) : isRunning ? (
        <ProcessControlButton onClick={onStop} disabled={isDisabled} title="Stop">
          <Square size={13} />
        </ProcessControlButton>
      ) : (
        <ProcessControlButton onClick={() => onStart?.()} disabled={isDisabled || !onStart} title="Start">
          <Play size={13} />
        </ProcessControlButton>
      )}
      <ProcessControlButton onClick={onRestart} disabled={isDisabled} title="Restart">
        <RotateCw size={13} />
      </ProcessControlButton>
    </div>
  );
}

function BackendConsoleTab() {
  const { status, isInstalled, isRunning, currentVersion, latestVersion, progress, startNow, stopNow, restartNow, uninstallNow } = useBackendUpdater();
  const { config, saveConfig } = useConfig();
  const text = `status=${status} installed=${isInstalled} running=${isRunning} current=${currentVersion ?? 'n/a'} latest=${latestVersion ?? 'n/a'}`;
  const isBusy = status === 'installing' || status === 'starting' || status === 'stopping' || status === 'restarting' || status === 'uninstalling';
  const autostartEnabled = config?.backend?.enabled ?? true;

  function toggleAutostart(nextEnabled: boolean) {
    if (!config) return;
    saveConfig({ ...config, backend: { enabled: nextEnabled } });
  }

  return (
    <StatusBlock
      title="Backend status"
      text={text}
      note="Live stdout from the Backend process is not piped into the app yet, see the Flags note for this session."
    >
      <div className="flex items-center justify-between gap-3 font-sans">
        <ProcessControls
          isRunning={isRunning}
          isBusy={isBusy}
          disabled={!isInstalled}
          disabledReason="Install the backend first from Updates"
          onStart={startNow}
          onStop={stopNow}
          onRestart={restartNow}
        />
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-velo-text-secondary">
            <input
              type="checkbox"
              checked={autostartEnabled}
              disabled={isBusy || !config}
              onChange={(event) => toggleAutostart(event.target.checked)}
            />
            Autostart
          </label>
          {isInstalled && (
            <button
              onClick={uninstallNow}
              disabled={isBusy}
              className="text-xs text-velo-coral underline disabled:opacity-40"
            >
              {status === 'uninstalling' ? 'Uninstalling…' : 'Uninstall'}
            </button>
          )}
        </div>
      </div>
      <ProgressBar progress={progress} />
    </StatusBlock>
  );
}

function TunnelConsoleTab() {
  const { config } = useConfig();
  const managed = config?.connection.cloudflare_relay.managed ?? false;
  const { status, error, actionStatus, progress, restartNow, stopNow } = useTunnelStatus(managed);
  const text = status
    ? `managed=${managed} running=${status.running} installed=${status.installed} version=${status.version ?? 'n/a'}`
    : error ?? 'Managed tunnel mode is off';
  const isBusy = actionStatus === 'restarting' || actionStatus === 'stopping';

  return (
    <StatusBlock
      title="Tunnel status"
      text={text}
      note="Live stdout from cloudflared is not piped into the app yet, see the Flags note for this session."
    >
      <div className="flex items-center justify-between gap-3 font-sans">
        <ProcessControls
          isRunning={status?.running ?? false}
          isBusy={isBusy}
          disabled={!managed}
          disabledReason="Enable the Cloudflare managed tunnel mode in Connection settings first"
          onStart={restartNow}
          onStop={stopNow}
          onRestart={restartNow}
        />
      </div>
      <ProgressBar progress={progress} />
    </StatusBlock>
  );
}

function resolveTabs(environment: ReturnType<typeof getClientEnvironment>): ConsoleTabId[] {
  if (environment === 'DESKTOP_VIEWER') return ['app', 'backend', 'tunnel'];
  return ['app'];
}

function ConsoleTabBar({ tabs, activeTab, onSelect }: { tabs: ConsoleTabId[]; activeTab: ConsoleTabId; onSelect: (tab: ConsoleTabId) => void }) {
  if (tabs.length <= 1) return null;

  return (
    <div className="flex gap-1 border-b border-velo-background pb-2">
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onSelect(tab)}
          className={`rounded-t-lg px-3 py-1 text-sm capitalize ${
            activeTab === tab ? 'bg-velo-background text-velo-text-primary' : 'text-velo-text-secondary hover:text-velo-text-primary'
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

export function ConsolePanel() {
  const environment = getClientEnvironment();
  const tabs = resolveTabs(environment);
  const [activeTab, setActiveTab] = useState<ConsoleTabId>('app');

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3 rounded-2xl bg-velo-surface p-4">
      <ConsoleTabBar tabs={tabs} activeTab={activeTab} onSelect={setActiveTab} />
      {activeTab === 'app' && <DevLogList />}
      {activeTab === 'backend' && <BackendConsoleTab />}
      {activeTab === 'tunnel' && <TunnelConsoleTab />}
    </div>
  );
}
