const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const HTTP_PORT = 8080;
const WS_PATH = '/ws/browser-bridge';

let extensionClient = null;
let controllerClient = null;

const httpServer = http.createServer((req, res) => {
  if (req.url === '/') {
    const html = `<!DOCTYPE html>
<html>
<head><title>OpenClaw Gateway v2</title></head>
<body>
<h1>🟢 OpenClaw Gateway v2</h1>
<p>Extension: ${extensionClient ? '🟢 Connectée' : '🔴 Déconnectée'}</p>
<p>Contrôleur: ${controllerClient ? '🟢 Connecté' : '🔴 Déconnecté'}</p>
</body>
</html>`;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

const wss = new WebSocket.Server({ server: httpServer, path: WS_PATH });

wss.on('connection', (ws, req) => {
  console.log(`[GW2] ➕ Client connecté (${req.headers['user-agent']?.substring(0, 50) || 'unknown'})`);

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch(e) { return; }

    // Identification de l'extension
    if (msg.type === 'bridge.ready') {
      extensionClient = ws;
      ws.isExtension = true;
      console.log('[GW2] ✅ Extension Firefox identifiée');
      ws.send(JSON.stringify({ type: 'bridge.ack' }));
      return;
    }

    // Identification du contrôleur
    if (!ws.isExtension && !controllerClient) {
      controllerClient = ws;
      console.log('[GW2] ✅ Contrôleur identifié');
    }

    // Extension envoie un résultat
    if (ws.isExtension && msg.type && msg.commandId) {
      console.log(`[GW2] 📥 Résultat de l'extension: ${msg.type} ${msg.commandId}`);
      if (controllerClient && controllerClient.readyState === WebSocket.OPEN) {
        controllerClient.send(JSON.stringify({
          commandId: msg.commandId,
          payload: msg.payload || msg
        }));
      }
      return;
    }

    // Contrôleur envoie une commande
    if (!ws.isExtension && extensionClient && extensionClient.readyState === WebSocket.OPEN) {
      console.log(`[GW2] 📤 Commande reçue: ${msg.type} ${msg.commandId || ''}`);
      extensionClient.send(JSON.stringify(msg));
      return;
    }

    // Pas d'extension connectée
    if (!ws.isExtension) {
      ws.send(JSON.stringify({
        commandId: msg.commandId,
        payload: { error: 'Extension non connectée' }
      }));
    }
  });

  ws.on('close', () => {
    if (ws.isExtension) {
      console.log('[GW2] 🔴 Extension déconnectée');
      extensionClient = null;
    } else if (ws === controllerClient) {
      console.log('[GW2] 🔴 Contrôleur déconnecté');
      controllerClient = null;
    }
  });
});

httpServer.listen(HTTP_PORT, () => {
  console.log(`[GW2] 🚀 Gateway v2 sur http://localhost:${HTTP_PORT}`);
  console.log(`[GW2] 📡 WebSocket: ws://localhost:${HTTP_PORT}${WS_PATH}`);
});