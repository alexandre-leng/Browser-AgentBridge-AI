const WebSocket = require('ws');
const fs = require('fs');

const ws = new WebSocket('ws://localhost:8080/ws/browser-bridge');
let formalibreTabId = null;

ws.on('open', () => {
  console.log('✅ Connecté\n');
  
  // 1. D'abord lister les onglets pour trouver formalibre.org
  console.log('📋 Liste des onglets...');
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
    console.log(`${tabs.length} onglets trouvés`);
    
    // Chercher formalibre.org
    const formalibreTab = tabs.find(t => t.url?.includes('formalibre.org'));
    if (formalibreTab) {
      formalibreTabId = formalibreTab.id;
      console.log(`✅ formalibre.org trouvé dans onglet [${formalibreTabId}]`);
      
      // Naviguer dans cet onglet
      console.log('🌐 Navigation Portfolio...');
      ws.send(JSON.stringify({
        type: 'navigate',
        commandId: 'nav',
        payload: { 
          url: 'https://formalibre.org',
          tabId: formalibreTabId
        }
      }));
    } else {
      // Créer un nouvel onglet
      console.log('🌐 Création onglet formalibre.org...');
      ws.send(JSON.stringify({
        type: 'navigate',
        commandId: 'nav',
        payload: { url: 'https://formalibre.org' }
      }));
    }
  }
  
  if (msg.commandId === 'nav') {
    console.log('✅ formalibre.org chargé\n');
    setTimeout(() => {
      // Trouver "Portfolio" dans le DOM
      console.log('🔎 Recherche "Portfolio"...');
      ws.send(JSON.stringify({
        type: 'dom.find',
        commandId: 'find-portfolio',
        payload: { 
          text: 'Portfolio',
          tabId: formalibreTabId || msg.payload.tabId
        }
      }));
    }, 3000);
  }
  
  if (msg.commandId === 'find-portfolio') {
    if (msg.payload.error) {
      console.log('❌', msg.payload.error);
      // Essayer avec un autre texte
      console.log('🔎 Recherche "Accueil"...');
      ws.send(JSON.stringify({
        type: 'dom.find',
        commandId: 'find-accueil',
        payload: { text: 'Accueil' }
      }));
      return;
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
  
  if (msg.commandId === 'find-accueil') {
    // On a cherché Accueil pour voir le menu - prendre screenshot
    console.log('📸 Screenshot pour voir la page...');
    ws.send(JSON.stringify({
      type: 'screenshot',
      commandId: 'shot',
      payload: {}
    }));
  }
  
  if (msg.commandId === 'move') {
    console.log('✅ Souris positionnée\n');
    setTimeout(() => {
      console.log('👆 Clic...');
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
        fs.writeFileSync('formalibre-result.png', Buffer.from(match[2], 'base64'));
        console.log('✅ Screenshot sauvé: formalibre-result.png');
      }
    }
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (err) => console.error('❌', err.message));
setTimeout(() => { ws.close(); process.exit(1); }, 45000);