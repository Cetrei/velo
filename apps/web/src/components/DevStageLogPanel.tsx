import { useEffect, useState } from 'react';
import { Code2 } from 'lucide-react';
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

function DevLogEntryRow({ entry }: { entry: DevLogEntry }) {
  return (
    <li className="flex items-baseline gap-2 whitespace-nowrap">
      <span className="text-velo-text-secondary">{formatTimestamp(entry.timestamp)}</span>
      <span className={`truncate ${LEVEL_COLORS[entry.level]}`}>{entry.message}</span>
    </li>
  );
}

function DevLogEntryList({ entries }: { entries: DevLogEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-xs text-velo-text-secondary">No log entries recorded yet</p>;
  }

  return (
    <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto font-mono text-xs">
      {entries
        .slice()
        .reverse()
        .map((entry) => (
          <DevLogEntryRow key={entry.timestamp} entry={entry} />
        ))}
    </ul>
  );
}

export function DevStageLogPanel({ isEnabled }: DevStageLogPanelProps) {
  const [isVisible, setIsVisible] = useState(false);
  const entries = useDevLogEntries();

  if (!isEnabled) {
    return null;
  }

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        aria-label="Open connection debug log"
        className="fixed bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-md bg-velo-surface text-velo-text-secondary transition-colors hover:text-velo-indigo"
      >
        <Code2 size={16} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-3 right-3 flex w-80 max-w-[calc(100vw-1.5rem)] flex-col gap-2 rounded-xl bg-velo-surface p-3 shadow-lg">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-velo-text-primary">Connection debug log</span>
        <button onClick={() => setIsVisible(false)} className="text-xs text-velo-indigo underline">
          Hide
        </button>
      </div>
      <DevLogEntryList entries={entries} />
    </div>
  );
}
