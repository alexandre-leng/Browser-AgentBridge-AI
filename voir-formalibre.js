const WebSocket = require('ws');
const fs = require('fs');

const ws = new WebSocket('ws://localhost:8080/ws/browser-bridge');

ws.on('open', () => {
  console.log('✅ Connecté\n');
  
  // Vérifier les onglets
  ws.send(JSON.stringify({
    type: 'tab.list',
    commandId: 'list',
    payload: {}
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  
  if (msg.commandId === 'list') {
    const tabs = msg.payload.tabs || [];
    const formalibreTab = tabs.find(t => t.url?.includes('formalibre.org'));
    
    if (formalibreTab) {
      console.log('✅ formalibre.org trouvé dans onglet', formalibreTab.id);
      // Activer l'onglet
      ws.send(JSON.stringify({
        type: 'navigate',
        commandId: 'activate',
        payload: { 
          url: 'https://formalibre.org',
          tabId: formalibreTab.id
        }
      }));
    } else {
      console.log('🌐 formalibre.org non trouvé, création...');
      ws.send(JSON.stringify({
        type: 'navigate',
        commandId: 'nav',
        payload: { url: 'https://formalibre.org' }
      }));
    }
  }
  
  if (msg.commandId === 'activate' || msg.commandId === 'nav') {
    console.log('✅ Page chargée, attente...');
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
    if (msg.payload.dataUrl) {
      const match = msg.payload.dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
      if (match) {
        fs.writeFileSync('formalibre-vue.png', Buffer.from(match[2], 'base64'));
        console.log('✅ Screenshot sauvé: formalibre-vue.png');
      }
    }
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (err) => console.error('❌', err.message));
setTimeout(() => { ws.close(); process.exit(1); }, 30000);