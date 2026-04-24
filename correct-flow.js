const WebSocket = require('ws');
const fs = require('fs');

function send(ws, type, payload) {
  return new Promise((resolve) => {
    const cmdId = 'cf-' + Date.now();
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
    setTimeout(() => { ws.off('message', handler); resolve({success:false,error:'timeout'}); }, 20000);
  });
}

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function screenshot(ws, name) {
  const r = await send(ws, 'screenshot', {});
  if (r.payload?.dataUrl) {
    const m = r.payload.dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (m) {
      fs.writeFileSync(name, Buffer.from(m[2], 'base64'));
      console.log('   📸 Screenshot:', name);
    }
  }
}

async function main() {
  const ws = new WebSocket('ws://localhost:8080/ws/browser-bridge');
  await new Promise((res,rej) => { ws.on('open',res); ws.on('error',rej); });
  
  console.log('=== CORRECTION: Navigation + Clic sur le BON onglet ===\n');
  
  // 1. Lister les onglets pour trouver formalibre
  console.log('1. Recherche de l\'onglet formalibre...');
  let r = await send(ws, 'tab.list', {});
  
  let formalibreTab = null;
  if (r.payload?.tabs) {
    formalibreTab = r.payload.tabs.find(t => 
      t.url?.includes('formalibre') || 
      t.title?.toLowerCase().includes('formalibre')
    );
    
    if (formalibreTab) {
      console.log('   ✅ Onglet trouvé:', formalibreTab.title);
      console.log('   ID:', formalibreTab.id);
    } else {
      console.log('   ❌ Onglet formalibre non trouvé');
      console.log('   Onglets disponibles:');
      r.payload.tabs.forEach(t => console.log(`      - ${t.title} (${t.url})`));
    }
  }
  
  // 2. Si pas trouvé, naviguer dans l'onglet ACTIF
  if (!formalibreTab) {
    console.log('\n2. Navigation dans l\'onglet actif...');
    r = await send(ws, 'navigate', { 
      url: 'https://www.formalibre.org',
      options: { newTab: false }  // Forcer l'onglet actif
    });
    console.log('   Résultat:', r.success ? 'OK' : 'ECHEC');
    await delay(4000);
  } else {
    // Activer l'onglet formalibre
    console.log('\n2. Activation de l\'onglet formalibre...');
    // On ne peut pas changer d'onglet directement, on navigue à nouveau
    r = await send(ws, 'navigate', { 
      url: 'https://www.formalibre.org',
      options: { newTab: false }
    });
    await delay(4000);
  }
  
  // 3. Vérifier où on est
  console.log('\n3. Vérification...');
  await screenshot(ws, 'step1-formalibre.png');
  
  // 4. Chercher le lien/bouton Connexion
  console.log('\n4. Clic sur Connexion...');
  
  // Essayer différentes variantes
  const variants = ['Connexion', 'connexion', 'Se connecter', 'se connecter', 'Login', 'login'];
  let clicked = false;
  
  for (const text of variants) {
    r = await send(ws, 'mouse.clickOnText', { text });
    if (r.success) {
      console.log('   ✅ Clic réussi avec:', text);
      clicked = true;
      break;
    }
  }
  
  if (!clicked) {
    console.log('   ❌ Aucune variante de "connexion" n\'a fonctionné');
  }
  
  await delay(3000);
  
  // 5. Screenshot final
  console.log('\n5. Screenshot final...');
  await screenshot(ws, 'step2-apres-connexion.png');
  
  console.log('\n=== TERMINÉ ===');
  ws.close();
}

main().catch(console.error);
