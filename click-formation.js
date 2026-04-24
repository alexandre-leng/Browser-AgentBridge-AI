const WebSocket = require('ws');
const fs = require('fs');

const ws = new WebSocket('ws://localhost:8080/ws/browser-bridge');

ws.on('open', () => {
  console.log('Bridge OK');
  ws.send(JSON.stringify({
    type: 'navigate',
    commandId: 'n1',
    payload: { url: 'https://www.formalibre.org', options: { newTab: false } }
  }));
});

ws.on('message', (d) => {
  const m = JSON.parse(d.toString());
  
  if (m.commandId === 'n1') {
    console.log('Nav:', m.success ? 'OK' : 'ECHEC', m.payload?.title || '');
    if (m.success) {
      setTimeout(() => {
        ws.send(JSON.stringify({
          type: 'dom.click',
          commandId: 'c1',
          payload: { selector: 'a[href="/formation"]' }
        }));
      }, 4000);
    }
  }
  
  if (m.commandId === 'c1') {
    console.log('Clic a[href=/formation]:', m.success ? 'OK' : 'ECHEC');
    if (m.payload?.error) console.log('Erreur:', m.payload.error);
    setTimeout(() => {
      ws.send(JSON.stringify({ type: 'screenshot', commandId: 's1', payload: {} }));
    }, 3000);
  }
  
  if (m.commandId === 's1') {
    if (m.payload?.dataUrl) {
      const match = m.payload.dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
      if (match) fs.writeFileSync('formation-click.png', Buffer.from(match[2], 'base64'));
      console.log('Screenshot: formation-click.png');
    }
    ws.close();
  }
});

ws.on('error', (e) => console.log('ERR:', e.message));
setTimeout(() => { console.log('Timeout'); ws.close(); }, 25000);
