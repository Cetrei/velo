import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import rateLimit from 'express-rate-limit';
import { readSystemConfig, readUserConfig } from './config';
import { registerSignalingHandlers } from './signaling';
import { registerConfigRoutes } from './config-route';
import { registerStatusRoute } from './status-route';
import { registerVersionRoute } from './version-route';
import { registerPairingRoutes } from './pairing-route';
import { attachSocketRateLimiting } from './socket-rate-limit';
import { formatLog, LogMessage } from './log-messages';

const ALLOWED_ORIGIN = process.env.VELO_ALLOWED_ORIGIN ?? 'https://velo.cetrei.dev';
const HTTP_RATE_LIMIT_WINDOW_MS = 60_000;
const HTTP_RATE_LIMIT_MAX_REQUESTS = 60;

const systemConfig = readSystemConfig();
const app = express();

// Trusts exactly one hop (the Cloudflare Tunnel process running alongside this backend),
// so express-rate-limit reads the real client IP from X-Forwarded-For instead of throwing
// ERR_ERL_UNEXPECTED_X_FORWARDED_FOR or mis-attributing every request to the tunnel's IP.
app.set('trust proxy', 1);

app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(
  rateLimit({
    windowMs: HTTP_RATE_LIMIT_WINDOW_MS,
    limit: HTTP_RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);
app.use(express.json({ limit: '16kb' }));

registerConfigRoutes(app, systemConfig, readUserConfig);
registerVersionRoute(app);
registerPairingRoutes(app);

const httpServer = createServer(app);
const RELAY_FRAME_MAX_BYTES = 512 * 1024;

const io = new Server(httpServer, {
  cors: { origin: ALLOWED_ORIGIN },
  maxHttpBufferSize: RELAY_FRAME_MAX_BYTES,
});
registerStatusRoute(app, systemConfig);

io.on('connection', (socket) => {
  attachSocketRateLimiting(socket);
  registerSignalingHandlers(io, socket);
});

httpServer.listen(systemConfig.network.signaling_port, () => {
  console.log(formatLog(LogMessage.ServerStarted, { port: systemConfig.network.signaling_port }));
});
