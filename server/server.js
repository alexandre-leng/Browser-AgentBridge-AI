/**
 * OpenClaw Browser Bridge - Server v3.2.1 (Stable)
 * Gateway WebSocket + Serveur Dashboard
 */

const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const PUBLIC_DIR = path.join(__dirname, 'public');

const clients = new Set();

// Sécurité : Capturer les erreurs non gérées pour éviter le crash
process.on('uncaughtException', (err) => {
  console.error('[CRASH] Erreur non capturée:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRASH] Rejection non gérée à:', promise, 'raison:', reason);
});

// Helper pour servir les fichiers statiques
function serveFile(res, filePath, contentType) {
  try {
    if (fs.existsSync(filePath)) {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(fs.readFileSync(filePath));
      return true;
    }
  } catch (e) {
    console.error(`Erreur accès fichier ${filePath}:`, e.message);
  }
  return false;
}

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json'
};

const server = http.createServer((req, res) => {
  if (req.url === '/api/clients') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ count: clients.size }));
    return;
  }

  let url = req.url === '/' ? '/index.html' : req.url;
  if (url === '/viewer') url = '/stream-viewer.html';

  const filePath = path.join(PUBLIC_DIR, url);
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'text/plain';

  if (!serveFile(res, filePath, contentType)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end(`404: Not Found (${req.url})`);
  }
});

const wss = new WebSocket.Server({ server, path: '/ws/browser-bridge' });

wss.on('connection', (ws) => {
  ws.clientType = 'unknown';
  ws.isAlive = true;
  clients.add(ws);
  
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    try {
      // Conversion Buffer -> String si nécessaire
      const messageStr = data.toString();
      const msg = JSON.parse(messageStr);

      // 1. Identification
      if (msg.type === 'bridge.ready') {
        ws.clientType = 'extension';
        ws.send(JSON.stringify({ type: 'bridge.ack', payload: { status: 'ready' } }));
        console.log('[Gateway] Extension connectée');
        return;
      }
      
      if (msg.type === 'bridge.heartbeat') {
        // Ignorer les pings dans le log pour ne pas polluer
        return;
      }

      if (msg.commandId && ws.clientType === 'unknown') {
        ws.clientType = 'dashboard';
        console.log('[Gateway] Dashboard connecté');
      }

      // 2. Relais intelligent avec protection
      const targetType = ws.clientType === 'dashboard' ? 'extension' : 'dashboard';
      
      clients.forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          // Relayer les commandes vers les extensions, et les résultats/frames vers les dashboards
          if (targetType === 'extension' && client.clientType === 'extension') {
            client.send(messageStr);
          } else if (targetType === 'dashboard' && client.clientType !== 'extension') {
            client.send(messageStr);
          }
        }
      });

    } catch (e) {
      // Ignorer les erreurs de parsing (ex: données binaires non JSON)
    }
  });

  ws.on('close', () => clients.delete(ws));
  ws.on('error', (err) => {
    console.warn('[Gateway] Erreur socket:', err.message);
    clients.delete(ws);
  });
});

// Nettoyage périodique des connexions mortes
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(interval));

server.listen(PORT, () => {
  console.log(`\x1b[32m[OpenClaw Server]\x1b[0m Stable Gateway sur http://localhost:${PORT}`);
});