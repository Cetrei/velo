import { useEffect, useState } from 'react';
import { Code2, Copy, Check } from 'lucide-react';
import { subscribeToDevLog, type DevLogEntry } from '../lib/dev-logger';

interface DevStageLogPanelProps {
  isEnabled: boolean;
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const LEVEL_COLORS: Record<DevLogEntry['level'], string> = {
  log: 'text-velo-text-primary',
  warn: 'text-velo-indigo',
  error: 'text-velo-coral',
};

function useDevLogEntries(): DevLogEntry[] {
  const [entries, setEntries] = useState<DevLogEntry[]>([]);

  useEffect(() => {
    return subscribeToDevLog(setEntries);
  }, []);

  return entries;
}

function formatEntryForCopy(entry: DevLogEntry): string {
  return `${formatTimestamp(entry.timestamp)} [${entry.level}] ${entry.message}`;
}

function formatEntriesForCopy(entries: DevLogEntry[]): string {
  return entries.map(formatEntryForCopy).join('\n');
}

function DevLogEntryRow({ entry }: { entry: DevLogEntry }) {
  return (
    <li className="flex flex-col gap-0.5 border-b border-velo-background/60 py-1.5 last:border-b-0">
      <span className="text-velo-text-secondary">{formatTimestamp(entry.timestamp)}</span>
      <span className={`whitespace-pre-wrap break-words ${LEVEL_COLORS[entry.level]}`}>{entry.message}</span>
    </li>
  );
}

function DevLogEntryList({ entries }: { entries: DevLogEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-xs text-velo-text-secondary">No log entries recorded yet</p>;
  }

  return (
    <ul className="flex max-h-[60vh] flex-col overflow-y-auto font-mono text-xs">
      {entries
        .slice()
        .reverse()
        .map((entry) => (
          <DevLogEntryRow key={entry.timestamp} entry={entry} />
        ))}
    </ul>
  );
}

function useCopyToClipboard(): [boolean, (text: string) => void] {
  const [didCopy, setDidCopy] = useState(false);

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setDidCopy(true);
      setTimeout(() => setDidCopy(false), 1500);
    }).catch((copyError) => {
      console.error('[DEV_LOG_PANEL] failed to copy log to clipboard', copyError);
    });
  }

  return [didCopy, copy];
}

export function DevStageLogPanel({ isEnabled }: DevStageLogPanelProps) {
  const [isVisible, setIsVisible] = useState(false);
  const entries = useDevLogEntries();
  const [didCopy, copyToClipboard] = useCopyToClipboard();

  if (!isEnabled) {
    return null;
  }

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        aria-label="Open connection debug log"
        className="fixed bottom-3 right-3 z-40 flex h-8 w-8 items-center justify-center rounded-md bg-velo-surface text-velo-text-secondary transition-colors hover:text-velo-indigo"
      >
        <Code2 size={16} />
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-velo-background/80 p-4"
      onClick={() => setIsVisible(false)}
    >
      <div
        className="flex w-full max-w-2xl flex-col gap-2 rounded-xl bg-velo-surface p-4 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-velo-text-primary">Connection debug log</span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => copyToClipboard(formatEntriesForCopy(entries))}
              disabled={entries.length === 0}
              aria-label="Copy full log to clipboard"
              className="flex items-center gap-1 text-xs text-velo-indigo underline disabled:opacity-40"
            >
              {didCopy ? <Check size={12} /> : <Copy size={12} />}
              {didCopy ? 'Copied' : 'Copy log'}
            </button>
            <button onClick={() => setIsVisible(false)} className="text-xs text-velo-indigo underline">
              Hide
            </button>
          </div>
        </div>
        <DevLogEntryList entries={entries} />
      </div>
    </div>
  );
}
