import { useEffect, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { subscribeToDevLog, type DevLogEntry } from '../lib/dev-logger';

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

function useCopyToClipboard(): [boolean, (text: string) => void] {
  const [didCopy, setDidCopy] = useState(false);

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setDidCopy(true);
      setTimeout(() => setDidCopy(false), 1500);
    }).catch((copyError) => {
      console.error('[DEV_LOG_LIST] failed to copy log to clipboard', copyError);
    });
  }

  return [didCopy, copy];
}

export function DevLogList() {
  const entries = useDevLogEntries();
  const [didCopy, copyToClipboard] = useCopyToClipboard();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-velo-text-primary">App log</span>
        <button
          onClick={() => copyToClipboard(formatEntriesForCopy(entries))}
          disabled={entries.length === 0}
          className="flex items-center gap-1 text-xs text-velo-indigo underline disabled:opacity-40"
        >
          {didCopy ? <Check size={12} /> : <Copy size={12} />}
          {didCopy ? 'Copied' : 'Copy log'}
        </button>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-velo-text-secondary">No log entries recorded yet</p>
      ) : (
        <ul className="flex max-h-[50vh] flex-col overflow-y-auto font-mono text-xs">
          {entries
            .slice()
            .reverse()
            .map((entry) => (
              <DevLogEntryRow key={entry.timestamp} entry={entry} />
            ))}
        </ul>
      )}
    </div>
  );
}
