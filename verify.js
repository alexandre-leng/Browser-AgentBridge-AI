const WebSocket = require('ws');
const fs = require('fs');

function send(ws, type, payload) {
  return new Promise((resolve) => {
    const cmdId = 'v-' + Date.now();
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
  
  console.log('Vérification de la page actuelle...\n');
  
  // 1. Screenshot pour voir où on est
  console.log('1. Screenshot...');
  let r = await send(ws, 'screenshot', {});
  if (r.payload?.dataUrl) {
    const m = r.payload.dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (m) {
      fs.writeFileSync('verify-page.png', Buffer.from(m[2], 'base64'));
      console.log('   Screenshot: verify-page.png');
    }
  }
  
  // 2. Vérifier l'onglet actif
  console.log('\n2. Vérification onglet actif...');
  r = await send(ws, 'tab.list', {});
  if (r.payload?.tabs) {
    const activeTab = r.payload.tabs.find(t => t.active);
    if (activeTab) {
      console.log('   Onglet actif:', activeTab.title);
      console.log('   URL:', activeTab.url);
    }
  }
  
  // 3. Si on est sur formalibre, chercher et cliquer sur Connexion
  console.log('\n3. Clic sur Connexion...');
  r = await send(ws, 'mouse.clickOnText', { text: 'Connexion' });
  console.log('   Résultat:', r.success ? 'OK' : 'ECHEC');
  if (r.payload?.error) console.log('   Erreur:', r.payload.error);
  
  // Attendre le chargement
  await new Promise(r => setTimeout(r, 3000));
  
  // 4. Nouveau screenshot
  console.log('\n4. Screenshot après clic...');
  r = await send(ws, 'screenshot', {});
  if (r.payload?.dataUrl) {
    const m = r.payload.dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (m) {
      fs.writeFileSync('verify-after-click.png', Buffer.from(m[2], 'base64'));
      console.log('   Screenshot: verify-after-click.png');
    }
  }
  
  // 5. Vérifier à nouveau l'onglet
  console.log('\n5. Vérification finale...');
  r = await send(ws, 'tab.list', {});
  if (r.payload?.tabs) {
    const activeTab = r.payload.tabs.find(t => t.active);
    if (activeTab) {
      console.log('   Onglet actif:', activeTab.title);
      console.log('   URL:', activeTab.url);
    }
  }
  
  console.log('\n=== VÉRIFICATION TERMINÉE ===');
  console.log('Regarde les screenshots:');
  console.log('- verify-page.png (avant clic)');
  console.log('- verify-after-click.png (après clic)');
  
  ws.close();
}

main().catch(console.error);
