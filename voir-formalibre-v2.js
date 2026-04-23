const WebSocket = require('ws');
const fs = require('fs');

const ws = new WebSocket('ws://localhost:8080/ws/browser-bridge');

ws.on('open', () => {
  console.log('✅ Connecté au gateway\n');
  
  // Aller directement sur formalibre.org
  console.log('🌐 Navigation formalibre.org...');
  ws.send(JSON.stringify({
    type: 'navigate',
    commandId: 'nav',
    payload: { url: 'https://formalibre.org' }
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log(`[${msg.commandId}]`, msg.payload.error ? `❌ ${msg.payload.error}` : '✅ OK');
  
  if (msg.commandId === 'nav') {
    if (msg.payload.error) {
      console.log('Erreur navigation:', msg.payload.error);
      ws.close();
      process.exit(1);
    }
    console.log('✅ Page chargée, attente 3s...');
    setTimeout(() => {
      console.log('📸 Screenshot...');
      ws.send(JSON.stringify({
        type: 'screenshot',
        commandId: 'shot',
        payload: {}
      }));
    }, 3000);
  }
  
  if (msg.commandId === 'shot') {
    if (msg.payload.error) {
      console.log('❌ Screenshot:', msg.payload.error);
    } else if (msg.payload.dataUrl) {
      const match = msg.payload.dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
      if (match) {
        fs.writeFileSync('formalibre-vue.png', Buffer.from(match[2], 'base64'));
        console.log('\n✅ Screenshot sauvé: formalibre-vue.png');
      }
    }
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (err) => console.error('❌ Erreur WS:', err.message));
setTimeout(() => { 
  console.log('⏰ Timeout'); 
  ws.close(); 
  process.exit(1); 
}, 30000);