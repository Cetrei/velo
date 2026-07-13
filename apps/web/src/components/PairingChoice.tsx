import { useEffect, useRef, useState } from 'react';
import { buildPairingDeepLink } from '../lib/pairing';
import type { PairingFromUrl } from '../lib/pairing';

const APP_OPEN_FALLBACK_MS = 1500;

interface PairingChoiceProps {
  pairing: PairingFromUrl;
  onContinueInBrowser: () => void;
}

function useAppOpenAttempt(pairing: PairingFromUrl) {
  const [isAttempting, setIsAttempting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const attemptOpenApp = () => {
    setIsAttempting(true);
    window.location.href = buildPairingDeepLink(pairing.roomId, pairing.otp);
    timerRef.current = setTimeout(() => {
      setIsAttempting(false);
    }, APP_OPEN_FALLBACK_MS);
  };

  return { isAttempting, attemptOpenApp };
}

export function PairingChoice({ pairing, onContinueInBrowser }: PairingChoiceProps) {
  const { isAttempting, attemptOpenApp } = useAppOpenAttempt(pairing);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-velo-background px-6 text-center text-velo-text-primary">
      <h1 className="text-lg font-medium">How do you want to stream from this phone?</h1>
      <p className="max-w-xs text-sm text-velo-text-secondary">
        You can keep going right here in the browser, or open the Velo app if you have it installed.
      </p>
      <div className="flex flex-col gap-3">
        <button
          onClick={onContinueInBrowser}
          className="rounded-xl bg-velo-indigo px-6 py-3 text-sm font-medium text-white"
        >
          Continue in browser
        </button>
        <button
          onClick={attemptOpenApp}
          disabled={isAttempting}
          className="rounded-xl bg-velo-surface px-6 py-3 text-sm font-medium text-velo-text-primary disabled:opacity-40"
        >
          {isAttempting ? 'Opening Velo app…' : 'Open the Velo app'}
        </button>
      </div>
      {isAttempting && (
        <p className="text-xs text-velo-text-secondary">
          Nothing happened? The app may not be installed, use the browser option above.
        </p>
      )}
    </main>
  );
}
