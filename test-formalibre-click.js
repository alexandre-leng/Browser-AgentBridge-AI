const WebSocket = require('ws');
const fs = require('fs');

const ws = new WebSocket('ws://localhost:8080/ws/browser-bridge');

ws.on('open', () => {
  console.log('✅ Connecté au gateway\n');
  
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
    if (msg.payload.error) {
      console.log('❌ Navigation:', msg.payload.error);
      ws.close();
      process.exit(1);
    }
    console.log('✅ formalibre.org chargé\n');
    setTimeout(() => {
      // Utiliser clickOnText pour trouver et cliquer sur Portfolio
      console.log('🖱️ clickOnText: "Portfolio"...');
      ws.send(JSON.stringify({
        type: 'mouse.clickOnText',
        commandId: 'click-portfolio',
        payload: { text: 'Portfolio' }
      }));
    }, 3000);
  }
  
  if (msg.commandId === 'click-portfolio') {
    if (msg.payload.error) {
      console.log('❌', msg.payload.error);
      // Si Portfolio n'est pas trouvé, chercher d'autres éléments
      console.log('\n🔎 Recherche DOM pour voir ce qui est disponible...');
      ws.send(JSON.stringify({
        type: 'dom.find',
        commandId: 'find-menu',
        payload: { text: 'Accueil' }
      }));
      return;
    }
    
    console.log('✅ Clic sur Portfolio effectué !');
    console.log('   Position:', msg.payload.x, msg.payload.y);
    console.log('   Texte:', msg.payload.text?.substring(0, 80));
    console.log('   Lien:', msg.payload.href);
    
    setTimeout(() => {
      console.log('\n📸 Screenshot...');
      ws.send(JSON.stringify({
        type: 'screenshot',
        commandId: 'shot',
        payload: {}
      }));
    }, 4000);
  }
  
  if (msg.commandId === 'find-menu') {
    console.log('✅ Menu trouvé:', msg.payload.text?.substring(0, 100));
    console.log('   Position:', msg.payload.x, msg.payload.y);
    
    setTimeout(() => {
      console.log('\n📸 Screenshot pour voir la page...');
      ws.send(JSON.stringify({
        type: 'screenshot',
        commandId: 'shot',
        payload: {}
      }));
    }, 2000);
  }
  
  if (msg.commandId === 'shot') {
    if (msg.payload.dataUrl) {
      const match = msg.payload.dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
      if (match) {
        const filename = msg.payload.title?.includes('Portfolio') 
          ? 'formalibre-portfolio-page.png' 
          : 'formalibre-current.png';
        fs.writeFileSync(filename, Buffer.from(match[2], 'base64'));
        console.log('✅ Screenshot sauvé:', filename);
      }
    }
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (err) => {
  console.error('❌ Erreur WebSocket:', err.message);
  process.exit(1);
});

setTimeout(() => { 
  console.log('⏰ Timeout'); 
  ws.close(); 
  process.exit(1); 
}, 45000);