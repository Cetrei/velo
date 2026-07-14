import type { Express } from 'express';
import type { SystemConfig, UserConfig } from './config';
import { generateTurnCredentials, turnCredentialsToIceServers } from './turn-credentials';
import { formatLog, LogMessage } from './log-messages';

export function registerConfigRoutes(app: Express, systemConfig: SystemConfig, readUserConfig: () => UserConfig): void {
  app.get('/config/system', (_request, response) => {
    response.json({
      ice_servers: systemConfig.network.ice_servers,
      signaling_port: systemConfig.network.signaling_port,
      releases: systemConfig.releases,
    });
  });

  app.get('/config/user', (_request, response) => {
    const userConfig = readUserConfig();
    response.json({
      reconnection_interval_ms: userConfig.behavior.reconnection_interval_ms,
      enable_reconnection_loop: userConfig.behavior.enable_reconnection_loop,
      target_fps: userConfig.video.target_fps,
    });
  });

  app.get('/config/turn-credentials', (_request, response) => {
    const secret = process.env.TURN_STATIC_AUTH_SECRET;
    const turn = systemConfig.network.turn;
    if (!secret || !turn) {
      console.warn(formatLog(LogMessage.TurnRelayNotConfigured));
      response.json({ ice_servers: [] });
      return;
    }
    const credentials = generateTurnCredentials(turn, secret);
    response.json({ ice_servers: turnCredentialsToIceServers(credentials) });
  });
}
