import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { useBackendUpdater } from '../hooks/useBackendUpdater';
import { useTunnelStatus } from '../hooks/useTunnelStatus';
import { useConfig } from '../hooks/useConfig';
import { getClientEnvironment } from '../lib/environment';
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

function StatusBlock({ title, text, note }: { title: string; text: string; note: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-velo-background p-3 font-mono text-xs text-velo-text-primary">
      <div className="flex items-center justify-between">
        <span className="text-velo-text-secondary">{title}</span>
        <CopyButton text={text} />
      </div>
      <p className="whitespace-pre-wrap break-words">{text}</p>
      <p className="text-velo-text-secondary">{note}</p>
    </div>
  );
}

function BackendConsoleTab() {
  const { status, isInstalled, isRunning, currentVersion, latestVersion } = useBackendUpdater();
  const text = `status=${status} installed=${isInstalled} running=${isRunning} current=${currentVersion ?? 'n/a'} latest=${latestVersion ?? 'n/a'}`;

  return (
    <StatusBlock
      title="Backend status"
      text={text}
      note="Live stdout from the Backend process is not piped into the app yet, see the Flags note for this session."
    />
  );
}

function TunnelConsoleTab() {
  const { config } = useConfig();
  const managed = config?.connection.cloudflare_relay.managed ?? false;
  const { status, error } = useTunnelStatus(managed);
  const text = status
    ? `managed=${managed} running=${status.running} installed=${status.installed} version=${status.version ?? 'n/a'}`
    : error ?? 'Managed tunnel mode is off';

  return (
    <StatusBlock
      title="Tunnel status"
      text={text}
      note="Live stdout from cloudflared is not piped into the app yet, see the Flags note for this session."
    />
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
