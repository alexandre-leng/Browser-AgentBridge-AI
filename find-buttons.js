const WebSocket = require('ws');

function send(ws, type, payload) {
  return new Promise((resolve) => {
    const cmdId = 'fb-' + Date.now();
    const handler = (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.commandId === cmdId) {
          ws.off('message', handler);
          resolve(msg);
        }
      } catch(e){}
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ type, commandId: cmdId, payload }));
    setTimeout(() => { ws.off('message', handler); resolve({success:false,error:'timeout'}); }, 15000);
  });
}

async function main() {
  const ws = new WebSocket('ws://localhost:8080/ws/browser-bridge');
  await new Promise((res,rej) => { ws.on('open',res); ws.on('error',rej); });
  
  console.log('Recherche des boutons sur formalibre.org...\n');
  
  // Extraire tous les éléments interactifs
  let r = await send(ws, 'dom.inspect', {});
  
  if (r.payload?.elements) {
    console.log('Total elements:', r.payload.elements.length);
    console.log('\n--- Boutons et Liens ---');
    r.payload.elements
      .filter(e => e.tag === 'BUTTON' || e.tag === 'A' || e.role === 'button')
      .forEach((e, i) => {
        console.log(`${i+1}. [${e.tag}] "${e.text?.substring(0,50) || 'sans texte'}" ${e.id ? '(#'+e.id+')' : ''}`);
      });
    
    console.log('\n--- Inputs ---');
    r.payload.elements
      .filter(e => e.tag === 'INPUT')
      .forEach((e, i) => {
        console.log(`${i+1}. [${e.tag}] ${e.id ? '#'+e.id : ''} ${e.text ? '"'+e.text.substring(0,30)+'"' : ''}`);
      });
  } else {
    console.log('Aucun element trouve');
    console.log('Reponse:', JSON.stringify(r, null, 2).substring(0, 300));
  }
  
  // Essayer differentes variantes de "connexion"
  const variants = ['connexion', 'Connexion', 'se connecter', 'Se connecter', 'login', 'Login', 'identification', 'compte'];
  
  console.log('\n--- Test de clic sur variantes ---');
  for (const text of variants) {
    r = await send(ws, 'mouse.clickOnText', { text });
    if (r.success) {
      console.log(`✅ Clic reussi avec: "${text}"`);
      break;
    }
  }
  
  ws.close();
}

main().catch(console.error);
