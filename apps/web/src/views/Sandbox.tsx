import { useCallback, useState } from 'react';
import { getPairingFromUrl, type PairingFromUrl } from '../lib/pairing';
import { PairingChoice } from '../components/PairingChoice';
import { StreamingView } from './Host';

function EmptyLanding() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-velo-background text-velo-text-primary">
      <p className="text-velo-text-secondary">
        You're viewing Velo in a plain browser. Open the Velo desktop app or the Velo mobile app to pair a camera and start streaming.
      </p>
    </main>
  );
}

export function Sandbox() {
  const [urlPairing] = useState<PairingFromUrl | null>(() => getPairingFromUrl());
  const [hasChosenBrowser, setHasChosenBrowser] = useState(false);
  const [activePairing, setActivePairing] = useState<PairingFromUrl | null>(null);

  const handleContinueInBrowser = useCallback(() => {
    if (!urlPairing) return;
    setActivePairing(urlPairing);
    setHasChosenBrowser(true);
  }, [urlPairing]);

  const handleExit = useCallback(() => {
    setActivePairing(null);
    setHasChosenBrowser(false);
  }, []);

  if (!urlPairing) {
    return <EmptyLanding />;
  }

  if (activePairing) {
    return <StreamingView pairing={activePairing} onExit={handleExit} />;
  }

  if (!hasChosenBrowser) {
    return <PairingChoice pairing={urlPairing} onContinueInBrowser={handleContinueInBrowser} />;
  }

  return <EmptyLanding />;
}
