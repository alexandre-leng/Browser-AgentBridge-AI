const WebSocket = require('ws');
const fs = require('fs');

const ws = new WebSocket('ws://localhost:8080/ws/browser-bridge');

ws.on('open', () => {
  console.log('Bridge OK');
  console.log('Navigation vers Google...');
  ws.send(JSON.stringify({
    type: 'navigate',
    commandId: 'n1',
    payload: { url: 'https://www.google.com/search?q=montenegro+voyage+itineraire', options: { newTab: false } }
  }));
});

ws.on('message', (d) => {
  const m = JSON.parse(d.toString());
  
  if (m.commandId === 'n1') {
    console.log('Navigation:', m.success ? 'OK' : 'ECHEC');
    console.log('Titre:', m.payload?.title);
    
    // Attendre 5 secondes pour le chargement
    setTimeout(() => {
      console.log('\nExtraction des resultats...');
      ws.send(JSON.stringify({
        type: 'dom.extract',
        commandId: 'e1',
        payload: { type: 'links' }
      }));
    }, 5000);
  }
  
  if (m.commandId === 'e1') {
    console.log('\n=== RESULTATS ===');
    if (m.payload?.links) {
      console.log('Liens trouves:', m.payload.links.length);
      m.payload.links.slice(0, 8).forEach((r, i) => {
        console.log('\n' + (i+1) + '. ' + (r.text || 'Sans titre'));
        console.log('   URL: ' + r.href);
      });
    } else {
      console.log('Aucun lien trouve');
      console.log('Reponse:', JSON.stringify(m.payload).substring(0, 200));
    }
    
    setTimeout(() => {
      ws.send(JSON.stringify({ type: 'screenshot', commandId: 's1', payload: {} }));
    }, 2000);
  }
  
  if (m.commandId === 's1') {
    if (m.payload?.dataUrl) {
      const match = m.payload.dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
      if (match) {
        fs.writeFileSync('montenegro-results.png', Buffer.from(match[2], 'base64'));
        console.log('\n📸 Screenshot: montenegro-results.png');
      }
    }
    ws.close();
  }
});

ws.on('error', (e) => console.log('ERR:', e.message));
setTimeout(() => { console.log('Timeout'); ws.close(); }, 35000);
