declare const VELO_BACKEND_VERSION: string;

const DEV_FALLBACK_VERSION = '0.0.0-dev';

export function getBackendVersion(): string {
  if (typeof VELO_BACKEND_VERSION === 'string' && VELO_BACKEND_VERSION.length > 0) {
    return VELO_BACKEND_VERSION;
  }
  return DEV_FALLBACK_VERSION;
}
