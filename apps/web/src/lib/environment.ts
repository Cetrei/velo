import { Capacitor } from '@capacitor/core';

export type ClientEnvironment = 'DESKTOP_VIEWER' | 'MOBILE_HOST' | 'WEB_SANDBOX';

export function getClientEnvironment(): ClientEnvironment {
  const isTauri = typeof window !== 'undefined' && (window as any).__TAURI__ !== undefined;
  const isCapacitorNative = Capacitor.isNativePlatform();

  if (isTauri) return 'DESKTOP_VIEWER';
  if (isCapacitorNative) return 'MOBILE_HOST';
  return 'WEB_SANDBOX';
}
