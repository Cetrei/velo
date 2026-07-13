import { useCallback, useState } from 'react';
import { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } from '@capacitor/barcode-scanner';
import { getPairingFromUrlString, type PairingFromUrl } from '../lib/pairing';

interface QrScannerButtonProps {
  onScanned: (pairing: PairingFromUrl) => void;
}

async function scanForPairing(): Promise<PairingFromUrl | null> {
  const result = await CapacitorBarcodeScanner.scanBarcode({
    hint: CapacitorBarcodeScannerTypeHint.QR_CODE,
  });
  return getPairingFromUrlString(result.ScanResult);
}

export function QrScannerButton({ onScanned }: QrScannerButtonProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleScan = useCallback(() => {
    setIsScanning(true);
    setError(null);
    scanForPairing()
      .then((pairing) => {
        if (!pairing) {
          setError('That QR code is not a Velo pairing code');
          return;
        }
        onScanned(pairing);
      })
      .catch(() => {
        setError('Could not open the camera to scan');
      })
      .finally(() => {
        setIsScanning(false);
      });
  }, [onScanned]);

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={handleScan}
        disabled={isScanning}
        className="text-sm text-velo-indigo underline disabled:opacity-40"
      >
        {isScanning ? 'Opening camera…' : 'Scan a QR code instead'}
      </button>
      {error && <p className="text-xs text-velo-coral">{error}</p>}
    </div>
  );
}
