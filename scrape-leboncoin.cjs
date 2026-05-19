const WebSocket = require('ws');
const WS_URL = 'ws://localhost:8080/ws/browser-bridge';

function send(ws, cmd) {
  return new Promise((resolve, reject) => {
    const handler = (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'human.feedback' || msg.type === 'hello') return;
        if (msg.id === cmd.id) {
          ws.off('message', handler);
          if (!msg.ok) reject(new Error(msg.error));
          else resolve(msg.result);
        }
      } catch (e) {}
    };
    ws.on('message', handler);
    ws.send(JSON.stringify(cmd));
  });
}

async function main() {
  const ws = new WebSocket(WS_URL);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  console.log('1. Navigate to LeBonCoin cookeo search...');
  await send(ws, { id: '1', type: 'navigate', payload: { url: 'https://www.leboncoin.fr/recherche?q=cookeo' } });
  await new Promise(r => setTimeout(r, 4000));

  // Scroll down multiple times to load more results
  console.log('2. Scrolling to load results...');
  for (let i = 0; i < 5; i++) {
    await send(ws, { id: `scroll${i}`, type: 'agent.scroll', payload: { direction: 'down', amount: 800 } });
    await new Promise(r => setTimeout(r, 1500));
  }

  // Get visible text with high limit
  console.log('3. Extracting text...');
  const textResult = await send(ws, { id: 'text', type: 'dom.visibleText', payload: { limit: 300 } });

  // Parse cookeo ads from the visible text
  const seen = new Set();
  let adCount = 0;
  const ads = [];
  
  if (textResult && textResult.items) {
    // Find the main content area (items with y > 150 and meaningful text)
    const contentItems = textResult.items.filter(i => {
      const text = (i.text || '').trim();
      return text && text.length > 3 && i.box && i.box.y > 120 && i.box.y < 5000 &&
             !/^(Renforcer|aller au|Immobilier|Véhicules|Vacances|Emploi|Mode|Maison|Famille|Électronique|Loisirs|Autres|Bons plans|Choisir|Étendre|Tri|Déposer|Favoris|Se connecter|Mes recherches|Messages|Plan|Qui|Nous|Politique|Gestion|Vos droits|Avis|Confiance|Paiement|Accessibilité|Aide|Envoyer|Confidentialité|Conditions|Infos|Excellent|Trustpilot|LinkedIn|Tendance|En ce moment|Recherches récentes|Ignorer|Voir plus|C’est le moment)/.test(text);
    });

    // Group into ads: look for patterns like Title, Price, Location
    let currentAd = null;
    
    for (const item of contentItems) {
      const text = (item.text || '').trim();
      if (!text) continue;
      
      // Detect ad title (short, starts with capital letter, not a price/location/date)
      if (text.match(/^[A-ZÀ-ÿ][a-zà-ÿ]/) && text.length < 120 && 
          !text.match(/^\d+/) && !text.includes('€') && !text.match(/^(Prix|Livraison|Située|aujourd|hier|Catégorie|Pro |Vendeur)/) &&
          text.length > 5) {
        // New ad
        if (currentAd && currentAd.title) ads.push(currentAd);
        currentAd = { title: text, price: '', location: '', description: '' };
      } else if (currentAd && text.match(/^\d+[.,]?\d*\s*€/) && !currentAd.price) {
        currentAd.price = text;
      } else if (currentAd && (text.startsWith('Prix:') || text.startsWith('Prix :')) && !currentAd.price) {
        currentAd.price = text;
      } else if (currentAd && (text.match(/Située/) || text.match(/\d{5}\s/)) && !currentAd.location) {
        currentAd.location = text;
      }
    }
    if (currentAd && currentAd.title) ads.push(currentAd);
  }

  // Display results
  console.log(`\n=== ${ads.length} ANNONCES COOKEO SUR LEBONCOIN ===\n`);
  ads.slice(0, 50).forEach((ad, i) => {
    console.log(`${i+1}. ${ad.title}`);
    if (ad.price) console.log(`   ${ad.price}`);
    if (ad.location) console.log(`   ${ad.location}`);
    console.log();
  });

  if (ads.length === 0 && textResult && textResult.items) {
    // Fallback: show items that contain "cookeo" 
    console.log('Recherche de résultats contenant "cookeo"...\n');
    const cookeoItems = textResult.items.filter(i => {
      const text = (i.text || i.name || '').toLowerCase();
      return text.includes('cookeo');
    });
    
    if (cookeoItems.length > 0) {
      const seen2 = new Set();
      cookeoItems.forEach((item, i) => {
        const text = (item.text || item.name || '').trim();
        if (seen2.has(text.substring(0, 30))) return;
        seen2.add(text.substring(0, 30));
        console.log(`${i+1}. ${text.substring(0, 200)}`);
      });
    } else {
      // Show raw items from main content area
      console.log('Aucun résultat spécifique trouvé. Affichage des données brutes:\n');
      const mainItems = textResult.items.filter(i => i.box && i.box.y > 150 && i.box.y < 3000)
        .slice(0, 30);
      mainItems.forEach((item, i) => {
        const text = (item.text || item.name || '').trim();
        if (text && text.length > 5) console.log(`${i+1}. ${text.substring(0, 150)}`);
      });
    }
  }

  ws.close();
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
