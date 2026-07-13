import { getClientEnvironment } from './environment';

const DEVICE_NAME_STORAGE_KEY = 'velo-device-name';
const RANDOM_SUFFIX_LENGTH = 4;

const PLATFORM_PREFIXES: Record<ReturnType<typeof getClientEnvironment>, string> = {
  MOBILE_HOST: 'Phone',
  DESKTOP_VIEWER: 'Desktop',
  WEB_SANDBOX: 'Browser',
};

function generateRandomSuffix(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let index = 0; index < RANDOM_SUFFIX_LENGTH; index += 1) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return suffix;
}

function readStoredDeviceName(): string | null {
  try {
    return window.localStorage.getItem(DEVICE_NAME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistDeviceName(deviceName: string): void {
  try {
    window.localStorage.setItem(DEVICE_NAME_STORAGE_KEY, deviceName);
  } catch {
    console.warn('[WEB] Failed to persist device name, a new one will be generated next session');
  }
}

export function getDeviceName(): string {
  const stored = readStoredDeviceName();
  if (stored) {
    return stored;
  }

  const prefix = PLATFORM_PREFIXES[getClientEnvironment()];
  const deviceName = `${prefix}-${generateRandomSuffix()}`;
  persistDeviceName(deviceName);
  return deviceName;
}
