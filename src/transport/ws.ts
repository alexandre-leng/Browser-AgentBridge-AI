import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, resolve, sep } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { buildHandlers } from '../browser/handlers/index.js';
import { sessionStore, controller } from '../browser/controller.js';
import { log } from '../logger.js';
import { isLocalHost, requireBridgeToken, securityFromEnv } from '../browser/security.js';
import { scrubPayload } from '../browser/scrub.js';
import { traces } from '../browser/traces.js';
import { VERSION } from '../version.js';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
};

const VIEWER_CSP = "default-src 'self'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'";

const SECURITY = securityFromEnv();
const BRIDGE_TOKEN = requireBridgeToken(SECURITY);
const BIND_HOST = SECURITY.bindHost;
const ALLOWED_ORIGINS = SECURITY.allowedOrigins;

function serveFile(baseDir: string, rawFile: string, res: ServerResponse): Promise<void> {
  return (async () => {
    const target = resolve(baseDir, rawFile);
    const baseResolved = resolve(baseDir);
    if (target !== baseResolved && !target.startsWith(baseResolved + sep)) {
      res.writeHead(403, SECURITY_HEADERS);
      res.end('forbidden');
      return;
    }
    try {
      const data = await readFile(target);
      res.writeHead(200, {
        'Content-Type': MIME[extname(target)] ?? 'application/octet-stream',
        ...SECURITY_HEADERS,
      });
      res.end(data);
    } catch {
      res.writeHead(404, SECURITY_HEADERS);
      res.end('not found');
    }
  })();
}

export function scrubError(err: unknown): { message: string; code: string } {
  const raw = (err as any)?.message ?? String(err);
  const firstLine = String(raw).split('\n')[0].slice(0, 300);
  const code = (err as any)?.name ?? 'Error';
  return { message: firstLine, code };
}

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

  const viewerDir = resolve(process.cwd(), 'src', 'viewer');
  const capturesDir = resolve(process.cwd(), 'logs', 'screenshots');

  const http = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = req.url ?? '/';
      if (url === '/' || url === '/viewer' || url === '/viewer/') {
        const html = await readFile(join(viewerDir, 'index.html'), 'utf8');
        res.writeHead(200, {
          'Content-Type': MIME['.html'],
          'Content-Security-Policy': VIEWER_CSP,
          ...SECURITY_HEADERS,
        });
        res.end(html);
        return;
      }
      if (url.startsWith('/viewer/')) {
        const file = decodeURIComponent(url.replace(/^\/viewer\//, '').split('?')[0]);
        await serveFile(viewerDir, file, res);
        return;
      }
      if (url.startsWith('/captures/')) {
        const file = decodeURIComponent(url.replace(/^\/captures\//, '').split('?')[0]);
        await serveFile(capturesDir, file, res);
        return;
      }
      if (url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json', ...SECURITY_HEADERS });
        res.end(JSON.stringify({
          ok: true,
          wsClients: clients.size,
          browserReady: controller.isReady(),
          sessions: controller.listSessions().length,
          uptime: process.uptime()
        }));
        return;
      }
      res.writeHead(404, SECURITY_HEADERS);
      res.end('not found');
    } catch {
      res.writeHead(500, SECURITY_HEADERS);
      res.end('error');
    }
  });

  const wss = new WebSocketServer({
    server: http,
    path: '/ws/browser-bridge',
    verifyClient: (info, done) => {
      const origin = info.origin ?? '';
      if (ALLOWED_ORIGINS.length > 0 && origin && !ALLOWED_ORIGINS.includes(origin)) {
        log('warn', 'ws rejected: origin', { origin });
        return done(false, 403, 'origin not allowed');
      }
      if (BRIDGE_TOKEN) {
        const auth = info.req.headers['authorization'] ?? '';
        const bearer = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : '';
        let ok = bearer === BRIDGE_TOKEN;
        if (!ok && isLocalHost(BIND_HOST)) {
          const urlStr = info.req.url ?? '';
          const qTokenMatch = urlStr.match(/[?&]token=([^&]+)/);
          const qToken = qTokenMatch ? decodeURIComponent(qTokenMatch[1]) : '';
          ok = qToken === BRIDGE_TOKEN;
        }
        if (!ok) {
          log('warn', 'ws rejected: token', {});
          return done(false, 401, 'unauthorized');
        }
      }
      done(true);
    }
  });
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
      const sessionId = payload?.sessionId || 'default';
      const t0 = Date.now();
      const handler = handlers[type];
      if (!handler) {
        log('warn', 'unknown command', { sessionId, cmd: type });
        ws.send(JSON.stringify({ id, ok: false, error: `unknown command: ${type}` }));
        return;
      }
      try {
        const payloadObj = payload ?? {};
        const result = await sessionStore.run(payloadObj.sessionId, async () => {
          return await handler(payloadObj);
        });
        const durationMs = Date.now() - t0;
        const safePayload = scrubPayload(payloadObj, type);
        traces.record({ sessionId, command: type, ok: true, durationMs, payload: safePayload, result });
        log('info', 'cmd ok', { sessionId, cmd: type, ok: true, durationMs });
        ws.send(JSON.stringify({ id, type, ok: true, result }));
      } catch (err) {
        const durationMs = Date.now() - t0;
        const { message, code } = scrubError(err);
        const safePayload = scrubPayload(payload, type);
        traces.record({ sessionId, command: type, ok: false, durationMs, payload: safePayload, error: message });
        log('error', 'cmd err', { sessionId, cmd: type, ok: false, durationMs, errorCode: code, error: message });
        ws.send(JSON.stringify({ id, type, ok: false, error: message, code }));
      }
    });
    ws.send(JSON.stringify({ type: 'hello', payload: { version: VERSION } }));
  });
  const unsubscribe = controller.onEvent((evt) => broadcast(evt));

  http.listen(port, BIND_HOST, () => {
    log('info', 'server started', {
      host: BIND_HOST,
      port,
      viewer: `http://${BIND_HOST}:${port}/viewer`,
      ws: `ws://${BIND_HOST}:${port}/ws/browser-bridge`,
      authRequired: !!BRIDGE_TOKEN,
      originCheck: ALLOWED_ORIGINS.length > 0
    });
  });

  const close = async () => {
    unsubscribe();
    for (const c of clients) { try { c.close(); } catch { /* ignore */ } }
    clients.clear();
    await new Promise<void>((r) => wss.close(() => r()));
    await new Promise<void>((r) => http.close(() => r()));
  };

  return { http, wss, broadcast, close, unsubscribe };
}
