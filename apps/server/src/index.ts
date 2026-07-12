import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { readSystemConfig, readUserConfig } from './config';
import { registerSignalingHandlers } from './signaling';
import { registerConfigRoutes } from './config-route';
import { registerStatusRoute } from './status-route';
import { formatLog, LogMessage } from './log-messages';

const systemConfig = readSystemConfig();
const app = express();
registerConfigRoutes(app, systemConfig, readUserConfig);

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });
registerStatusRoute(app, systemConfig, io);

io.on('connection', (socket) => {
  registerSignalingHandlers(io, socket);
});

httpServer.listen(systemConfig.network.signaling_port, () => {
  console.log(formatLog(LogMessage.ServerStarted, { port: systemConfig.network.signaling_port }));
});
