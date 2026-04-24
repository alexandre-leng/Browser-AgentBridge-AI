const WebSocket = require('ws');
const fs = require('fs');

const ws = new WebSocket('ws://localhost:8080/ws/browser-bridge');

ws.on('open', () => {
  console.log('Bridge OK');
  console.log('Recherche: voyage montenegro parcours itineraire...');
  ws.send(JSON.stringify({
    type: 'search',
    commandId: 's1',
    payload: { engine: 'google', query: 'voyage montenegro parcours itineraire' }
  }));
});

ws.on('message', (d) => {
  const m = JSON.parse(d.toString());
  
  if (m.commandId === 's1') {
    console.log('\n=== RESULTATS DE RECHERCHE ===');
    console.log('Statut:', m.success ? 'OK' : 'ECHEC');
    console.log('Titre:', m.payload?.title);
    console.log('Nombre de resultats:', m.payload?.resultCount || 0);
    
    if (m.payload?.results) {
      console.log('\nTop 5 resultats:');
      m.payload.results.slice(0, 5).forEach((r, i) => {
        console.log('\n' + (i+1) + '. ' + r.title);
        console.log('   URL: ' + r.url);
        console.log('   ' + (r.snippet?.substring(0, 120) || '') + '...');
      });
    }
    
    setTimeout(() => {
      ws.send(JSON.stringify({ type: 'screenshot', commandId: 'shot1', payload: {} }));
    }, 3000);
  }
  
  if (m.commandId === 'shot1') {
    if (m.payload?.dataUrl) {
      const match = m.payload.dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
      if (match) {
        fs.writeFileSync('montenegro-search.png', Buffer.from(match[2], 'base64'));
        console.log('\n📸 Screenshot: montenegro-search.png');
      }
    }
    ws.close();
  }
});

ws.on('error', (e) => console.log('ERR:', e.message));
setTimeout(() => { console.log('Timeout'); ws.close(); }, 30000);
