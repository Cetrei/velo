import type { Express } from 'express';
import type { SystemConfig, UserConfig } from './config';

export function registerConfigRoutes(app: Express, systemConfig: SystemConfig, readUserConfig: () => UserConfig): void {
  app.get('/config/system', (_request, response) => {
    response.json({
      ice_servers: systemConfig.network.ice_servers,
      signaling_port: systemConfig.network.signaling_port,
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
}
