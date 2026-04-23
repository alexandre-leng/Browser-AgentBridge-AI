const WebSocket = require('ws');
const fs = require('fs');

const ws = new WebSocket('ws://localhost:8080/ws/browser-bridge');

ws.on('open', () => {
  console.log('✅ Connecté\n');
  
  // Aller sur formalibre.org dans un nouvel onglet
  console.log('🌐 formalibre.org...');
  ws.send(JSON.stringify({
    type: 'navigate',
    commandId: 'nav',
    payload: { 
      url: 'https://formalibre.org',
      options: { newTab: true }
    }
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  
  if (msg.commandId === 'nav') {
    console.log('✅ Page chargée\n');
    setTimeout(() => {
      // Utiliser exec.script pour trouver le lien Portfolio précisément
      console.log('🔎 Recherche précise du lien Portfolio...');
      ws.send(JSON.stringify({
        type: 'exec.script',
        commandId: 'find-portfolio-link',
        payload: {
          code: `
            // Chercher dans tous les éléments cliquables
            const allElements = Array.from(document.querySelectorAll('a, button, [role="button"], input[type="button"]'));
            
            // 1. Chercher texte exact "Portfolio"
            let portfolioEl = allElements.find(el => 
              el.textContent.trim().toLowerCase() === 'portfolio'
            );
            
            // 2. Chercher texte contenant "Portfolio"
            if (!portfolioEl) {
              portfolioEl = allElements.find(el => 
                el.textContent.toLowerCase().includes('portfolio')
              );
            }
            
            // 3. Chercher dans les attributs href
            if (!portfolioEl) {
              portfolioEl = allElements.find(el => 
                el.href?.toLowerCase().includes('portfolio')
              );
            }
            
            // 4. Chercher n'importe quel élément avec class/id contenant portfolio
            if (!portfolioEl) {
              portfolioEl = document.querySelector('[class*="portfolio" i], [id*="portfolio" i]');
            }
            
            if (portfolioEl) {
              const rect = portfolioEl.getBoundingClientRect();
              return {
                found: true,
                x: Math.round(rect.left + rect.width / 2),
                y: Math.round(rect.top + rect.height / 2),
                text: portfolioEl.textContent.trim().substring(0, 50),
                href: portfolioEl.href || null,
                tag: portfolioEl.tagName,
                class: portfolioEl.className || null
              };
            }
            
            // Debug: retourner les éléments trouvés
            const debug = allElements
              .filter(el => el.textContent.toLowerCase().includes('port'))
              .map(el => ({ tag: el.tagName, text: el.textContent.trim().substring(0, 30) }));
            
            return { found: false, message: 'Portfolio non trouvé', debug };
          `
        }
      }));
    }, 3000);
  }
  
  if (msg.commandId === 'find-portfolio-link') {
    if (msg.payload.result?.found) {
      const { x, y, text, href } = msg.payload.result;
      console.log('✅ Lien trouvé !');
      console.log(`   Texte: "${text}"`);
      console.log(`   Position: (${x}, ${y})`);
      console.log(`   Lien: ${href}\n`);
      
      // Déplacer et cliquer
      console.log('🖱️ Déplacement souris...');
      ws.send(JSON.stringify({
        type: 'mouse.move',
        commandId: 'move',
        payload: { x, y }
      }));
    } else {
      console.log('❌', msg.payload.result?.message || 'Non trouvé');
      ws.close();
      process.exit(1);
    }
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
        fs.writeFileSync('portfolio-page.png', Buffer.from(match[2], 'base64'));
        console.log('\n✅ Screenshot: portfolio-page.png');
      }
    }
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (err) => console.error('❌', err.message));
setTimeout(() => { ws.close(); process.exit(1); }, 45000);