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

function describeScanError(scanError: unknown): string {
  const rawMessage = scanError instanceof Error ? scanError.message : String(scanError);
  const normalizedMessage = rawMessage.toLowerCase();

  if (normalizedMessage.includes('cancel')) {
    return 'Scan cancelled';
  }
  if (normalizedMessage.includes('permission') || normalizedMessage.includes('camera access')) {
    return 'Camera permission is off for Velo. Enable it in your phone settings and try again.';
  }
  return 'Could not scan the QR code, try again or type the code shown on the computer';
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
      .catch((scanError) => {
        console.error('[WEB] QR scan failed', scanError);
        setError(describeScanError(scanError));
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
