const WebSocket = require('ws');
const fs = require('fs');

const ws = new WebSocket('ws://localhost:8080/ws/browser-bridge');

ws.on('open', () => {
  console.log('✅ Connecté\n');
  
  // Aller sur formalibre.org
  console.log('🌐 Navigation formalibre.org...');
  ws.send(JSON.stringify({
    type: 'navigate',
    commandId: 'nav',
    payload: { url: 'https://formalibre.org' }
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  
  if (msg.commandId === 'nav') {
    console.log('✅ formalibre.org chargé\n');
    setTimeout(() => {
      // Trouver "Portfolio" dans le DOM
      console.log('🔎 Recherche "Portfolio"...');
      ws.send(JSON.stringify({
        type: 'dom.find',
        commandId: 'find-portfolio',
        payload: { text: 'Portfolio' }
      }));
    }, 3000);
  }
  
  if (msg.commandId === 'find-portfolio') {
    if (msg.payload.error) {
      console.log('❌', msg.payload.error);
      ws.close();
      process.exit(1);
    }
    
    const { x, y, text, href } = msg.payload;
    console.log('✅ Élément trouvé !');
    console.log(`   Texte: "${text?.substring(0, 80)}"`);
    console.log(`   Position: (${x}, ${y})`);
    console.log(`   Lien: ${href}\n`);
    
    // Déplacer la souris
    console.log('🖱️ Déplacement souris...');
    ws.send(JSON.stringify({
      type: 'mouse.move',
      commandId: 'move',
      payload: { x, y }
    }));
  }
  
  if (msg.commandId === 'move') {
    console.log('✅ Souris positionnée\n');
    setTimeout(() => {
      // Clic
      console.log('👆 Clic sur Portfolio...');
      ws.send(JSON.stringify({
        type: 'mouse.click',
        commandId: 'click',
        payload: {}
      }));
    }, 800);
  }
  
  if (msg.commandId === 'click') {
    console.log('✅ Clic effectué !');
    setTimeout(() => {
      console.log('📸 Screenshot...');
      ws.send(JSON.stringify({
        type: 'screenshot',
        commandId: 'shot',
        payload: {}
      }));
    }, 4000);
  }
  
  if (msg.commandId === 'shot') {
    if (msg.payload.dataUrl) {
      const match = msg.payload.dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
      if (match) {
        fs.writeFileSync('formalibre-portfolio.png', Buffer.from(match[2], 'base64'));
        console.log('✅ Page Portfolio capturée !');
      }
    }
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (err) => console.error('❌', err.message));
setTimeout(() => { ws.close(); process.exit(1); }, 45000);