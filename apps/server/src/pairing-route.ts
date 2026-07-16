import type { Express } from 'express';
import { createPairing, findRoomIdByOtp } from './pairing';

const OTP_PATTERN = /^\d{6}$/;
const MAX_CREATOR_DEVICE_NAME_LENGTH = 64;

function sanitizeCreatorDeviceName(deviceName: unknown): string | undefined {
  if (typeof deviceName !== 'string' || deviceName.trim().length === 0) {
    return undefined;
  }
  return deviceName.slice(0, MAX_CREATOR_DEVICE_NAME_LENGTH);
}

export function registerPairingRoutes(app: Express): void {
  app.post('/pairing/create', (request, response) => {
    const creatorDeviceName = sanitizeCreatorDeviceName(request.body?.deviceName);
    const pairing = createPairing(creatorDeviceName);
    response.json({ roomId: pairing.roomId, otp: pairing.otp, expiresAt: pairing.expiresAt });
  });

  app.get('/pairing/resolve/:otp', (request, response) => {
    const { otp } = request.params;
    if (!OTP_PATTERN.test(otp)) {
      response.status(400).json({ error: 'invalid_otp_format' });
      return;
    }
    const roomId = findRoomIdByOtp(otp);
    if (!roomId) {
      response.status(404).json({ error: 'otp_not_found_or_expired' });
      return;
    }
    response.json({ roomId });
  });
}
