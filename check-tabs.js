const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8080/ws/browser-bridge');

ws.on('open', () => {
  console.log('✅ Connecté\n');
  ws.send(JSON.stringify({
    type: 'tab.list',
    commandId: 'list',
    payload: {}
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.commandId === 'list') {
    console.log('📋 Onglets ouverts:\n');
    msg.payload.tabs.forEach((t, i) => {
      const active = t.active ? ' [ACTIF]' : '';
      console.log(`${i+1}. [${t.id}] ${t.title?.substring(0, 50)}${active}`);
      console.log(`   ${t.url?.substring(0, 80)}`);
      console.log();
    });
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (err) => console.error('❌', err.message));
setTimeout(() => { ws.close(); process.exit(1); }, 10000);