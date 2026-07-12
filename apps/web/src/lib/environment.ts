export type ClientEnvironment = 'DESKTOP_VIEWER' | 'MOBILE_HOST' | 'WEB_SANDBOX';

export function getClientEnvironment(): ClientEnvironment {
  const isTauri = typeof window !== 'undefined' && (window as any).__TAURI__ !== undefined;
  const isCapacitor = typeof window !== 'undefined' && (window as any).Capacitor !== undefined;

  if (isTauri) return 'DESKTOP_VIEWER';
  if (isCapacitor) return 'MOBILE_HOST';
  return 'WEB_SANDBOX';
}
