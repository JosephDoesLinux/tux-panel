/**
 * VNC Service — WebSocket-to-TCP proxy for noVNC.
 *
 * Browser (noVNC)  ⟶  ws://host/vnc  ⟶  this proxy  ⟶  TCP target (any VNC server)
 *
 * All traffic is raw RFB binary frames; we pipe bytes in both
 * directions without inspecting or modifying them.
 */

import { Server as HttpServer, IncomingMessage } from 'http';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import { URL } from 'url';
import net from 'net';
import logger from '../utils/logger';
import { getActiveConnection } from './desktopService';

let wss: WebSocketServer | null = null;

export function initVncProxy(server: HttpServer) {
  wss = new WebSocketServer({ noServer: true });

  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    logger.info('VNC WebSocket connection requested');

    // Track bytes for debugging
    let wsToTcp = 0;
    let tcpToWs = 0;

    try {
      // ── Resolve target from query params or auto-detect ────────
      const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      const qHost = reqUrl.searchParams.get('host');
      const qPort = reqUrl.searchParams.get('port');

      let host: string;
      let port: number;

      if (qHost || qPort) {
        // Explicit target from frontend
        host = qHost || '127.0.0.1';
        port = qPort ? parseInt(qPort, 10) : 5900;
        logger.info(`VNC proxy target (query) → ${host}:${port}`);
      } else {
        // Fallback: auto-detect active local VNC
        const connectionInfo: any = await getActiveConnection();

        if (connectionInfo.status !== 'running') {
          logger.warn(`VNC proxy rejected: status is '${connectionInfo.status}', not 'running'`);
          ws.close(1008, 'No active VNC server');
          return;
        }

        port = connectionInfo.provider?.port || 5900;
        host = connectionInfo.provider?.host || '127.0.0.1';
      }

      logger.info(`Proxying VNC WebSocket → ${host}:${port}`);

      const vncSocket = net.connect(port, host, () => {
        logger.info(`TCP connected to VNC server at ${host}:${port}`);
      });

      // ── WebSocket → TCP (browser → VNC server) ─────────────────
      ws.on('message', (data: RawData, isBinary: boolean) => {
        // noVNC always sends binary frames; convert to Buffer
        const buf = Buffer.isBuffer(data)
          ? data
          : Buffer.from(data as ArrayBuffer);

        wsToTcp += buf.length;
        vncSocket.write(buf);
      });

      // ── TCP → WebSocket (VNC server → browser) ─────────────────
      vncSocket.on('data', (data: Buffer) => {
        if (ws.readyState === WebSocket.OPEN) {
          tcpToWs += data.length;
          // Explicitly send as binary opcode (0x02)
          ws.send(data, { binary: true });
        }
      });

      // ── Error / close handling ─────────────────────────────────
      vncSocket.on('error', (err) => {
        logger.error(`VNC TCP error: ${err.message}`);
        ws.close(1011, 'VNC server error');
      });

      vncSocket.on('close', () => {
        logger.info(`VNC TCP closed (ws→tcp ${wsToTcp} B, tcp→ws ${tcpToWs} B)`);
        if (ws.readyState === WebSocket.OPEN) ws.close();
      });

      ws.on('close', () => {
        logger.info(`VNC WebSocket closed (ws→tcp ${wsToTcp} B, tcp→ws ${tcpToWs} B)`);
        vncSocket.destroy();
      });

      ws.on('error', (err) => {
        logger.error(`VNC WebSocket error: ${err.message}`);
        vncSocket.destroy();
      });
    } catch (err: any) {
      logger.error(`Failed to initialise VNC proxy: ${err.message}`);
      ws.close(1011, 'Internal proxy error');
    }
  });

  return wss;
}

export function getWebSocketServer() {
  return wss;
}
