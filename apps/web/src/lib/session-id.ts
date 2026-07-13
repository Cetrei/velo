function toHex(byte: number): string {
  return byte.toString(16).padStart(2, '0');
}

function generateUuidViaGetRandomValues(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  if (bytes.length === 0) {
    throw new Error('Failed to generate random bytes for UUID');
  }

  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = Array.from(bytes, toHex).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function generateSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return generateUuidViaGetRandomValues();
  }
  console.warn('[WEB] crypto API unavailable, falling back to a non-cryptographic session id');
  return `fallback-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
