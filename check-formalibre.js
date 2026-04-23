const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8080/ws/browser-bridge');

ws.on('open', () => {
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
      console.log('✅ formalibre.org trouvé !');
      console.log(`   Onglet [${formalibreTab.id}]: ${formalibreTab.title}`);
      console.log(`   URL: ${formalibreTab.url}`);
      console.log(`   Actif: ${formalibreTab.active ? 'OUI' : 'NON'}`);
    } else {
      console.log('❌ formalibre.org non trouvé');
      console.log('\nOnglets disponibles:');
      tabs.forEach(t => console.log(`   [${t.id}] ${t.title?.substring(0, 40)}`));
    }
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (err) => console.error('❌', err.message));
setTimeout(() => { ws.close(); process.exit(1); }, 10000);