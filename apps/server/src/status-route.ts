import type { Express } from 'express';
import type { Server } from 'socket.io';
import type { SystemConfig } from './config';

function renderStatusPage(systemConfig: SystemConfig, connectedPeers: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Velo Signaling Status</title>
<style>
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #12131C;
    color: #F3F4F6;
    font-family: system-ui, sans-serif;
  }
  main {
    background: #1E2030;
    border-radius: 16px;
    padding: 32px 40px;
    text-align: center;
    min-width: 280px;
  }
  h1 {
    margin: 0 0 4px;
    font-size: 20px;
    color: #F3F4F6;
  }
  .status-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #10B981;
    margin-right: 8px;
  }
  .status-line {
    color: #10B981;
    font-weight: 600;
    margin-bottom: 20px;
  }
  dl {
    text-align: left;
    display: grid;
    grid-template-columns: auto auto;
    gap: 4px 16px;
    font-size: 14px;
  }
  dt {
    color: #9CA3AF;
  }
  dd {
    margin: 0;
    color: #F3F4F6;
    text-align: right;
  }
</style>
</head>
<body>
<main>
  <h1>Velo Signaling Server</h1>
  <p class="status-line"><span class="status-dot"></span>Online</p>
  <dl>
    <dt>Port</dt>
    <dd>${systemConfig.network.signaling_port}</dd>
    <dt>Connected peers</dt>
    <dd>${connectedPeers}</dd>
  </dl>
</main>
</body>
</html>`;
}

export function registerStatusRoute(app: Express, systemConfig: SystemConfig, io: Server): void {
  app.get('/status', (_request, response) => {
    const connectedPeers = io.sockets.sockets.size;
    response.type('html').send(renderStatusPage(systemConfig, connectedPeers));
  });
}
