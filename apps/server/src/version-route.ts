import type { Express } from 'express';
import { getBackendVersion } from './version';

export function registerVersionRoute(app: Express): void {
  app.get('/version', (_request, response) => {
    response.json({ version: getBackendVersion() });
  });
}
