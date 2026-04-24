const WebSocket = require('ws');

const type = process.argv[2];
const payloadStr = process.argv[3] || '{}';

if (!type) {
  console.log('Usage: node cmd.js <type> [payload_json]');
  process.exit(1);
}

let payload = {};
if (payloadStr.startsWith('#')) {
  const fs = require('fs');
  const filename = payloadStr.substring(1);
  try {
    payload = JSON.parse(fs.readFileSync(filename, 'utf8'));
  } catch (e) {
    console.error('Erreur lecture fichier:', e.message);
    process.exit(1);
  }
} else {
  try {
    payload = JSON.parse(payloadStr);
  } catch (e) {
    console.error('JSON invalide:', payloadStr);
    process.exit(1);
  }
}

const ws = new WebSocket('ws://localhost:8080/ws/browser-bridge');
const cmdId = 'cmd-' + Date.now();

ws.on('open', () => {
  console.log('Envoi:', type, JSON.stringify(payload));
  ws.send(JSON.stringify({ type, commandId: cmdId, payload }));
});

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data.toString());
    if (msg.commandId === cmdId) {
      console.log('Reponse:', JSON.stringify(msg.payload || msg, null, 2));
      ws.close();
    }
  } catch (e) {}
});

ws.on('error', (err) => {
  console.error('Erreur:', err.message);
  process.exit(1);
});

setTimeout(() => {
  console.log('Timeout');
  ws.close();
}, 15000);
