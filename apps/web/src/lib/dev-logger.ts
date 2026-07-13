export type DevLogLevel = 'log' | 'warn' | 'error';

export interface DevLogEntry {
  level: DevLogLevel;
  message: string;
  timestamp: number;
}

const MAX_DEV_LOG_ENTRIES = 200;

let buffer: DevLogEntry[] = [];
const listeners = new Set<(entries: DevLogEntry[]) => void>();

function notifyListeners(): void {
  listeners.forEach((listener) => listener(buffer));
}

function appendEntry(level: DevLogLevel, message: string): void {
  const entry: DevLogEntry = { level, message, timestamp: Date.now() };
  buffer = [...buffer, entry].slice(-MAX_DEV_LOG_ENTRIES);
  notifyListeners();
}

function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
    .join(' ');
}

let isPatched = false;

export function initDevLogger(): void {
  if (isPatched) return;
  isPatched = true;

  const originalLog = console.log.bind(console);
  const originalWarn = console.warn.bind(console);
  const originalError = console.error.bind(console);

  console.log = (...args: unknown[]) => {
    originalLog(...args);
    appendEntry('log', formatArgs(args));
  };
  console.warn = (...args: unknown[]) => {
    originalWarn(...args);
    appendEntry('warn', formatArgs(args));
  };
  console.error = (...args: unknown[]) => {
    originalError(...args);
    appendEntry('error', formatArgs(args));
  };
}

export function subscribeToDevLog(listener: (entries: DevLogEntry[]) => void): () => void {
  listeners.add(listener);
  listener(buffer);
  return () => {
    listeners.delete(listener);
  };
}

export function getDevLogEntries(): DevLogEntry[] {
  return buffer;
}

export function clearDevLog(): void {
  buffer = [];
  notifyListeners();
}
