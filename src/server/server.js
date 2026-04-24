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
const STORAGE_DIR = path.join(__dirname, '..', '..', 'logs', 'screenshots');

// S'assurer que le dossier de stockage existe
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

// Fonction de nettoyage
function cleanStorageDir() {
  console.log('[Server] Nettoyage des captures temporaires...');
  if (fs.existsSync(STORAGE_DIR)) {
    const files = fs.readdirSync(STORAGE_DIR);
    for (const file of files) {
      fs.unlinkSync(path.join(STORAGE_DIR, file));
    }
  }
}

// Nettoyage à la fermeture
process.on('SIGINT', () => { cleanStorageDir(); process.exit(); });
process.on('exit', () => { cleanStorageDir(); });

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
  ws.lastSeen = Date.now();
  clients.add(ws);

  ws.on('message', (data) => {
    // Toute trame entrante prouve que le client est en vie
    ws.lastSeen = Date.now();

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
        // Renvoyer un ack permet au client de mesurer la latence et de
        // détecter un serveur silencieux via son propre watchdog.
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'bridge.heartbeat.ack', timestamp: msg.timestamp }));
        }
        return;
      }

      if (msg.commandId && ws.clientType === 'unknown') {
        ws.clientType = 'dashboard';
        console.log('[Gateway] Dashboard connecté');
      }

      // 2. Relais intelligent avec protection
      const targetType = ws.clientType === 'dashboard' ? 'extension' : 'dashboard';

      // Sauvegarde automatique des screenshots si présents dans le message
      if (msg.type === 'command.result' && msg.payload && msg.payload.dataUrl) {
        const base64Data = msg.payload.dataUrl.replace(/^data:image\/\w+;base64,/, "");
        const fileName = `screenshot_${Date.now()}.${msg.payload.format || 'png'}`;
        const savePath = path.join(STORAGE_DIR, fileName);
        fs.writeFile(savePath, base64Data, 'base64', (err) => {
          if (err) return;
          console.log(`[Server] Screenshot sauvegardé temporairement : ${fileName}`);
          // Nettoyage 100% async pour ne garder que les 50 plus récents
          fs.readdir(STORAGE_DIR, async (err, files) => {
            if (err || files.length <= 50) return;
            try {
              const stats = await Promise.all(files.map(async name => ({
                name,
                time: (await fs.promises.stat(path.join(STORAGE_DIR, name))).mtime.getTime()
              })));
              stats.sort((a, b) => b.time - a.time); // plus récent d'abord
              const toDelete = stats.slice(50);
              await Promise.all(toDelete.map(f => fs.promises.unlink(path.join(STORAGE_DIR, f.name)).catch(() => {})));
            } catch (e) {
              console.warn('[Server] Cleanup screenshots:', e.message);
            }
          });
        });
      }
      
      if (msg.type !== 'bridge.heartbeat' && msg.type !== 'vision.frame') {
        console.log(`[Relais] ${ws.clientType} -> ${targetType} : ${msg.type}`);
      }

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
      // Données non-JSON (binaire, message tronqué) : on ne crash pas, mais on trace.
      if (process.env.DEBUG) {
        console.warn('[Gateway] Message non-JSON ignoré:', e.message);
      }
    }
  });

  ws.on('close', () => clients.delete(ws));
  ws.on('error', (err) => {
    console.warn('[Gateway] Erreur socket:', err.message);
    clients.delete(ws);
  });
});

// Watchdog applicatif : le ping/pong natif n'est pas fiable côté navigateur
// (l'API WebSocket DOM n'expose pas les frames ping). On se base donc sur
// l'horodatage du dernier message reçu, alimenté par bridge.heartbeat (15 s côté client).
const HEARTBEAT_TIMEOUT_MS = 45000;
const interval = setInterval(() => {
  const now = Date.now();
  wss.clients.forEach((ws) => {
    if (now - (ws.lastSeen || 0) > HEARTBEAT_TIMEOUT_MS) {
      console.warn(`[Gateway] Client ${ws.clientType} silencieux > ${HEARTBEAT_TIMEOUT_MS}ms, terminate`);
      ws.terminate();
    }
  });
}, 10000);

wss.on('close', () => clearInterval(interval));

server.listen(PORT, () => {
  console.log(`\x1b[32m[OpenClaw Server]\x1b[0m Stable Gateway sur http://localhost:${PORT}`);
});