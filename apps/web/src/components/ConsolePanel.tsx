import { useRef, useState } from 'react';
import { Copy, Check, Play, Square, RotateCw, Loader2, Terminal, FolderInput } from 'lucide-react';
import { useServerUpdater } from '../hooks/useServerUpdater';
import { useTunnelStatus } from '../hooks/useTunnelStatus';
import { useCoreStatus } from '../hooks/useCoreStatus';
import { useConfig } from '../hooks/useConfig';
import { getClientEnvironment } from '../lib/environment';
import { describeProgressPhase, progressPhaseFraction, type UpdateProgressEvent } from '../hooks/useUpdateProgress';
import { DevLogList } from './DevLogList';

type ConsoleTabId = 'app' | 'server' | 'tunnel' | 'core';

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

interface SideloadServerControlProps {
  isBusy: boolean;
  onSelectFile: (file: File) => void;
}

/// Lets a developer point the server updater at a locally built exe
/// instead of a GitHub release. Reads the file's bytes directly in the
/// browser via the File API rather than opening a native file dialog,
/// since Tauri doesn't expose real filesystem paths to the webview and
/// this avoids pulling in the separate dialog plugin for a dev-only tool.
function SideloadServerControl({ isBusy, onSelectFile }: SideloadServerControlProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) onSelectFile(file);
  }

  return (
    <>
      <input ref={fileInputRef} type="file" accept=".exe" className="hidden" onChange={handleFileChange} />
      <ProcessControlButton onClick={() => fileInputRef.current?.click()} disabled={isBusy} title="Install a local server exe (dev only)">
        <FolderInput size={13} />
      </ProcessControlButton>
    </>
  );
}

function ServerConsoleTab() {
  const {
    status,
    isInstalled,
    isRunning,
    currentVersion,
    latestVersion,
    progress,
    startNow,
    stopNow,
    restartNow,
    uninstallNow,
    installFromFile,
  } = useServerUpdater();
  const { config, saveConfig } = useConfig();
  const text = `status=${status} installed=${isInstalled} running=${isRunning} current=${currentVersion ?? 'n/a'} latest=${latestVersion ?? 'n/a'}`;
  const isBusy = status === 'installing' || status === 'starting' || status === 'stopping' || status === 'restarting' || status === 'uninstalling';
  const autostartEnabled = config?.server?.enabled ?? true;

  function toggleAutostart(nextEnabled: boolean) {
    if (!config) return;
    saveConfig({ ...config, server: { enabled: nextEnabled } });
  }

  return (
    <StatusBlock
      title="Server status"
      text={text}
      note="Live stdout from the Server process is not piped into the app yet, see the Flags note for this session."
    >
      <div className="flex items-center justify-between gap-3 font-sans">
        <div className="flex items-center gap-1.5">
          <ProcessControls
            isRunning={isRunning}
            isBusy={isBusy}
            disabled={!isInstalled}
            disabledReason="Install the server first from Updates"
            onStart={startNow}
            onStop={stopNow}
            onRestart={restartNow}
          />
          <SideloadServerControl isBusy={isBusy} onSelectFile={installFromFile} />
        </div>
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

function CoreConsoleTab() {
  const { status, error } = useCoreStatus();
  const text = status
    ? `loaded=${status.running} installed=${status.installed} version=${status.version ?? 'n/a'}`
    : error ?? 'Reading Velo-Core status\u2026';

  return (
    <StatusBlock
      title="Velo-Core status"
      text={text}
      note="Read-only. Velo-Core installs and updates itself automatically on every app startup, there is nothing to start, stop, or update manually here."
    />
  );
}

function resolveTabs(environment: ReturnType<typeof getClientEnvironment>): ConsoleTabId[] {
  if (environment === 'DESKTOP_VIEWER') return ['app', 'server', 'tunnel', 'core'];
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
      <div className="flex items-center gap-2 border-b border-velo-background pb-3">
        <Terminal size={16} className="text-velo-indigo" />
        <h2 className="text-sm font-medium text-velo-text-primary">Console</h2>
      </div>
      <ConsoleTabBar tabs={tabs} activeTab={activeTab} onSelect={setActiveTab} />
      {activeTab === 'app' && <DevLogList />}
      {activeTab === 'server' && <ServerConsoleTab />}
      {activeTab === 'tunnel' && <TunnelConsoleTab />}
      {activeTab === 'core' && <CoreConsoleTab />}
    </div>
  );
}
