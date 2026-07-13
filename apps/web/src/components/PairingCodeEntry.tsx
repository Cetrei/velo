import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { resolvePairingByOtp, type PairingFromUrl } from '../lib/pairing';
import { QrScannerButton } from './QrScannerButton';

interface PairingCodeEntryProps {
  signalingUrl: string;
  onPaired: (pairing: PairingFromUrl) => void;
}

export function PairingCodeEntry({ signalingUrl, onPaired }: PairingCodeEntryProps) {
  const [code, setCode] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (code.length !== 6) return;
    setIsChecking(true);
    setError(null);
    try {
      const pairing = await resolvePairingByOtp(signalingUrl, code);
      onPaired(pairing);
    } catch {
      setError('That code is wrong or has expired. Ask for a new one on the computer screen.');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-velo-background px-6 text-center text-velo-text-primary">
      <h1 className="text-lg font-medium">Enter the code shown on your computer</h1>
      <input
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric"
        placeholder="123456"
        maxLength={6}
        className="w-48 rounded-xl bg-velo-surface px-4 py-3 text-center text-2xl tracking-widest text-velo-text-primary outline-none"
      />
      {error && <p className="max-w-xs text-sm text-velo-coral">{error}</p>}
      <button
        onClick={handleSubmit}
        disabled={code.length !== 6 || isChecking}
        className="rounded-xl bg-velo-indigo px-6 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        {isChecking ? 'Checking…' : 'Connect'}
      </button>
      {Capacitor.isNativePlatform() && <QrScannerButton onScanned={onPaired} />}
    </main>
  );
}
