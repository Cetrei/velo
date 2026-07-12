import type { Express } from 'express';
import { createPairing } from './pairing';

export function registerPairingRoutes(app: Express): void {
  app.post('/pairing/create', (_request, response) => {
    const pairing = createPairing();
    response.json({ roomId: pairing.roomId, otp: pairing.otp, expiresAt: pairing.expiresAt });
  });
}
