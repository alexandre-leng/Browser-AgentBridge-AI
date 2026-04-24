const sendCommand = require('./live.js');

const url = process.argv[2] || 'https://www.google.com';
console.log('Navigation vers:', url);

// On va utiliser directement le WebSocket
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:8080/ws/browser-bridge');

ws.on('open', () => {
  console.log('Connecte au bridge');
  ws.send(JSON.stringify({
    type: 'navigate',
    commandId: 'nav-' + Date.now(),
    payload: { url }
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.type === 'command.result' && msg.commandId?.startsWith('nav-')) {
    console.log('Navigation:', msg.success ? 'OK' : 'ECHEC');
    console.log('Titre:', msg.payload?.title);
    console.log('URL:', msg.payload?.url);
    ws.close();
  }
});

ws.on('error', (err) => console.error('Erreur:', err.message));
setTimeout(() => ws.close(), 15000);
