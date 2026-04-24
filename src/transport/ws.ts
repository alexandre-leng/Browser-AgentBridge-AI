import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { buildHandlers } from '../browser/handlers.js';
import { sessionStore, controller } from '../browser/controller.js';
import { log } from '../logger.js';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

export function startServer(port = 8080) {
  const clients = new Set<WebSocket>();
  const broadcast = (msg: any) => {
    const data = JSON.stringify(msg);
    for (const c of clients) if (c.readyState === WebSocket.OPEN) c.send(data);
  };
  const handlers: Record<string, any> = {};
  const dispatch = async (type: string, payload: any) => {
    const h = handlers[type];
    if (!h) throw new Error(`unknown command: ${type}`);
    return h(payload);
  };
  Object.assign(handlers, buildHandlers(broadcast, dispatch));

  const viewerDir = join(process.cwd(), 'src', 'viewer');
  const capturesDir = join(process.cwd(), 'logs', 'screenshots');

  const http = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = req.url ?? '/';
      if (url === '/' || url === '/viewer' || url === '/viewer/') {
        const html = await readFile(join(viewerDir, 'index.html'), 'utf8');
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(html);
        return;
      }
      if (url.startsWith('/viewer/')) {
        const file = url.replace(/^\/viewer\//, '');
        const p = join(viewerDir, file);
        const data = await readFile(p);
        res.writeHead(200, { 'Content-Type': MIME[extname(p)] ?? 'application/octet-stream' });
        res.end(data);
        return;
      }
      if (url.startsWith('/captures/')) {
        const file = url.replace(/^\/captures\//, '');
        const p = join(capturesDir, file);
        const data = await readFile(p);
        res.writeHead(200, { 'Content-Type': MIME[extname(p)] ?? 'application/octet-stream' });
        res.end(data);
        return;
      }
      if (url === '/health') {
        const { controller } = await import('../browser/controller.js');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          wsClients: clients.size,
          browserReady: !!(controller as any).defaultContext || controller.listSessions().length > 0,
          sessions: controller.listSessions().length,
          uptime: process.uptime()
        }));
        return;
      }
      res.writeHead(404);
      res.end('not found');
    } catch {
      res.writeHead(500);
      res.end('error');
    }
  });

  const wss = new WebSocketServer({ server: http, path: '/ws/browser-bridge' });
  const clientLimits = new Map<WebSocket, { count: number; resetAt: number }>();

  wss.on('connection', (ws) => {
    clients.add(ws);
    clientLimits.set(ws, { count: 0, resetAt: Date.now() + 60000 });
    ws.on('close', () => {
      clients.delete(ws);
      clientLimits.delete(ws);
    });
    ws.on('message', async (raw) => {
      const limit = clientLimits.get(ws);
      const now = Date.now();
      if (limit) {
        if (now > limit.resetAt) {
          limit.count = 0;
          limit.resetAt = now + 60000;
        }
        limit.count++;
        if (limit.count > 100) {
          ws.send(JSON.stringify({ ok: false, error: 'rate limited' }));
          return;
        }
      }
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        ws.send(JSON.stringify({ ok: false, error: 'invalid json' }));
        return;
      }
      const { id, type, payload } = msg;
      log('info', 'received command', { type, sessionId: payload?.sessionId || 'default', payload });
      const handler = handlers[type];
      if (!handler) {
        ws.send(JSON.stringify({ id, ok: false, error: `unknown command: ${type}` }));
        return;
      }
      try {
        const payloadObj = payload ?? {};
        const result = await sessionStore.run(payloadObj.sessionId, async () => {
          return await handler(payloadObj);
        });
        log('info', 'command result', { type, ok: true });
        ws.send(JSON.stringify({ id, type, ok: true, result }));
      } catch (err: any) {
        log('error', 'command error', { type, error: err?.message || String(err) });
        ws.send(JSON.stringify({ id, type, ok: false, error: err?.message ?? String(err) }));
      }
    });
    ws.send(JSON.stringify({ type: 'hello', payload: { version: '3.0.0' } }));
  });
  controller.onEvent((evt) => broadcast(evt));

  http.listen(port, () => {
    log('info', 'server started', { port, viewer: `http://localhost:${port}/viewer`, ws: `ws://localhost:${port}/ws/browser-bridge` });
  });

  return { http, wss, broadcast };
}
