const WebSocket = require('ws');

const WS_URL = 'ws://localhost:8080/ws/browser-bridge';

async function sendCommand(ws, cmd) {
  return new Promise((resolve) => {
    const handler = (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.id === cmd.id) {
          ws.off('message', handler);
          resolve(msg);
        }
      } catch (e) {}
    };
    ws.on('message', handler);
    ws.send(JSON.stringify(cmd));
  });
}

async function withBridge(fn) {
  const ws = new WebSocket(WS_URL);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  try {
    return await fn(ws);
  } finally {
    ws.close();
  }
}

module.exports = { sendCommand, withBridge };
