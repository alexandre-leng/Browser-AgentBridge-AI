const WebSocket = require('ws');
const fs = require('fs');

const ws = new WebSocket('ws://localhost:8080/ws/browser-bridge');

ws.on('open', () => {
  console.log('✅ Connecté\n');
  
  // Test: Aller sur Google et cliquer sur "Voyageurs du Monde"
  console.log('🔍 Navigation Google...');
  ws.send(JSON.stringify({
    type: 'navigate',
    commandId: 'nav',
    payload: { url: 'https://www.google.com/search?q=voyage+Mont%C3%A9n%C3%A9gro&hl=fr' }
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  
  if (msg.commandId === 'nav') {
    console.log('✅ Google chargé\n');
    setTimeout(() => {
      // Utiliser clickOnText pour trouver et cliquer
      console.log('🖱️ clickOnText: "Voyageurs du Monde"...');
      ws.send(JSON.stringify({
        type: 'mouse.clickOnText',
        commandId: 'click-text',
        payload: { text: 'Voyageurs du Monde' }
      }));
    }, 4000);
  }
  
  if (msg.commandId === 'click-text') {
    if (msg.payload.error) {
      console.log('❌', msg.payload.error);
    } else {
      console.log('✅ Clic effectué !');
      console.log('   Position:', msg.payload.x, msg.payload.y);
      console.log('   Texte:', msg.payload.text?.substring(0, 80));
      console.log('   Lien:', msg.payload.href);
    }
    
    setTimeout(() => {
      console.log('📸 Screenshot...');
      ws.send(JSON.stringify({
        type: 'screenshot',
        commandId: 'shot',
        payload: {}
      }));
    }, 5000);
  }
  
  if (msg.commandId === 'shot') {
    if (msg.payload.dataUrl) {
      const match = msg.payload.dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
      if (match) {
        fs.writeFileSync('clickontext-result.png', Buffer.from(match[2], 'base64'));
        console.log('✅ Résultat sauvé: clickontext-result.png');
      }
    }
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (err) => console.error('❌', err.message));
setTimeout(() => { ws.close(); process.exit(1); }, 45000);