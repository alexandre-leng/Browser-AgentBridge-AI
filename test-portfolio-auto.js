const WebSocket = require('ws');
const fs = require('fs');

const ws = new WebSocket('ws://localhost:8080/ws/browser-bridge');

ws.on('open', () => {
  console.log('✅ Connecté\n');
  
  // Créer un nouvel onglet pour formalibre.org
  console.log('🌐 Création onglet formalibre.org...');
  ws.send(JSON.stringify({
    type: 'navigate',
    commandId: 'nav',
    payload: { url: 'https://formalibre.org', options: { newTab: true } }
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  
  if (msg.commandId === 'nav') {
    if (msg.payload.error) {
      console.log('❌ Erreur navigation:', msg.payload.error);
      ws.close();
      process.exit(1);
    }
    console.log('✅ formalibre.org chargé (onglet', msg.payload.tabId + ')\n');
    
    // Attendre le chargement complet
    setTimeout(() => {
      // Utiliser dom.find pour trouver Portfolio
      console.log('🔎 Recherche "Portfolio" dans le DOM...');
      ws.send(JSON.stringify({
        type: 'dom.find',
        commandId: 'find-portfolio',
        payload: { text: 'Portfolio' }
      }));
    }, 3000);
  }
  
  if (msg.commandId === 'find-portfolio') {
    if (msg.payload.error) {
      console.log('❌ Portfolio non trouvé:', msg.payload.error);
      console.log('\n🔍 Recherche d\'autres éléments de menu...');
      
      // Chercher ce qui est disponible
      ws.send(JSON.stringify({
        type: 'exec.script',
        commandId: 'list-menu',
        payload: {
          code: `
            const links = Array.from(document.querySelectorAll('a, button, [role="button"]'));
            const menuItems = links
              .map(a => ({ text: a.textContent.trim(), href: a.href, tag: a.tagName }))
              .filter(item => item.text.length > 0 && item.text.length < 100)
              .slice(0, 15);
            return { total: links.length, items: menuItems };
          `
        }
      }));
      return;
    }
    
    const { x, y, text, href, tabId } = msg.payload;
    console.log('✅ Portfolio trouvé !');
    console.log(`   Texte: "${text?.substring(0, 80)}"`);
    console.log(`   Position: (${x}, ${y})`);
    console.log(`   Lien: ${href}\n`);
    
    // Déplacer la souris et cliquer
    console.log('🖱️ Déplacement souris...');
    ws.send(JSON.stringify({
      type: 'mouse.move',
      commandId: 'move',
      payload: { x, y }
    }));
  }
  
  if (msg.commandId === 'list-menu') {
    const items = msg.payload.result?.items || [];
    console.log(`\n📋 ${items.length} éléments de menu trouvés:`);
    items.forEach((item, i) => {
      console.log(`   ${i+1}. "${item.text?.substring(0, 50)}" (${item.tag})`);
    });
    
    ws.close();
    process.exit(0);
  }
  
  if (msg.commandId === 'move') {
    console.log('✅ Souris positionnée\n');
    setTimeout(() => {
      console.log('👆 Clic sur Portfolio...');
      ws.send(JSON.stringify({
        type: 'mouse.click',
        commandId: 'click',
        payload: {}
      }));
    }, 500);
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
        fs.writeFileSync('portfolio-result.png', Buffer.from(match[2], 'base64'));
        console.log('\n✅ Screenshot sauvé: portfolio-result.png');
      }
    }
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (err) => {
  console.error('❌ Erreur:', err.message);
  process.exit(1);
});

setTimeout(() => { 
  console.log('⏰ Timeout'); 
  ws.close(); 
  process.exit(1); 
}, 60000);