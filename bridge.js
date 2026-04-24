/**
 * OpenClaw Browser Bridge - Client CLI Simple v3.4
 * Usage: node bridge.js <command> [args]
 * 
 * Exemples:
 *   node bridge.js navigate https://google.com
 *   node bridge.js click "Rechercher"
 *   node bridge.js type "input[name=q]" "openclaw"
 *   node bridge.js screenshot
 *   node bridge.js extract
 *   node bridge.js read
 *   node bridge.js find.text "conditions générales"
 *   node bridge.js goto.text "Accepter"
 *   node bridge.js search google "openclaw browser bridge"
 */

const WebSocket = require('ws');

const GATEWAY_URL = 'ws://localhost:8080/ws/browser-bridge';
const TIMEOUT = 30000;

function sendCommand(type, payload = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(GATEWAY_URL);
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error('Timeout après ' + TIMEOUT + 'ms'));
    }, TIMEOUT);

    ws.on('open', () => {
      const commandId = 'cmd_' + Date.now();
      ws.send(JSON.stringify({
        type,
        payload,
        commandId,
        timestamp: Date.now()
      }));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'command.result' || msg.type === 'bridge.ack') {
          clearTimeout(timer);
          ws.close();
          resolve(msg.payload || msg);
        }
      } catch (e) {}
    });

    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log(`
🦾 OpenClaw Browser Bridge - Client CLI v3.4

Usage: node bridge.js <command> [arguments]

=== NAVIGATION ===
  navigate <url>              Naviguer vers une URL
  search <engine> <query>     Rechercher (google, bing, duckduckgo)

=== INTERACTION ===
  click <text|selector>       Cliquer sur un élément
  type <selector> <text>      Taper du texte dans un champ
  fill <label> <valeur>       Remplir un champ par son label
  press <key>                 Presser une touche (Enter, Tab, Escape...)
  scroll <pixels>             Scroller (positif=bas, négatif=haut)

=== EXTRACTION DE TEXTE ===
  read                        Lire tout le texte de la page avec positions
  read.sections               Lire le texte par sections
  find.text <texte>           Trouver la position d'un texte
  goto.text <texte>           Déplacer la souris sur un texte

=== EXTRACTION DOM ===
  extract                     Extraire la structure complète de la page
  screenshot                  Capturer l'écran
  find <text>                 Trouver un élément par texte
  tabs                        Lister les onglets
  html                        Récupérer le HTML complet
  status                      Vérifier la connexion

Exemples:
  node bridge.js navigate https://github.com/openclaw/openclaw
  node bridge.js click "Sign in"
  node bridge.js read
  node bridge.js find.text "conditions générales"
  node bridge.js goto.text "Accepter"
  node bridge.js search google "météo paris"
    `);
    return;
  }

  const [command, ...rest] = args;

  try {
    let result;

    switch (command) {
      case 'navigate':
      case 'goto':
        result = await sendCommand('navigate', { url: rest[0] });
        break;

      case 'search': {
        const engine = rest[0] || 'google';
        const query = rest.slice(1).join(' ');
        result = await sendCommand('search', { engine, query });
        break;
      }

      case 'click': {
        const target = rest.join(' ');
        const isSelector = target.startsWith('#') || target.startsWith('.') || target.startsWith('[') || target.includes('>');
        result = await sendCommand('dom.click', isSelector ? { selector: target } : { text: target });
        break;
      }

      case 'type': {
        const selector = rest[0];
        const text = rest.slice(1).join(' ');
        result = await sendCommand('dom.type', { selector, value: text });
        break;
      }

      case 'fill': {
        const label = rest[0];
        const value = rest.slice(1).join(' ');
        result = await sendCommand('dom.fillForm', { fields: { [label]: value } });
        break;
      }

      case 'screenshot':
        result = await sendCommand('screenshot', {});
        break;

      case 'extract':
        result = await sendCommand('dom.extract', { type: 'full' });
        break;

      case 'scroll': {
        const amount = parseInt(rest[0]) || 500;
        result = await sendCommand('mouse.scroll', { y: amount });
        break;
      }

      case 'press':
        result = await sendCommand('dom.press', { key: rest[0] });
        break;

      case 'find':
        result = await sendCommand('dom.find', { text: rest.join(' ') });
        break;

      case 'tabs':
        result = await sendCommand('tab.list', {});
        break;

      case 'html':
        result = await sendCommand('dom.html', {});
        break;

      // === NOUVELLES COMMANDES DE TEXTE ===
      case 'read':
        result = await sendCommand('read', {});
        break;

      case 'read.sections':
      case 'read-sections':
        result = await sendCommand('read.sections', {});
        break;

      case 'find.text':
      case 'find-text': {
        const text = rest.join(' ');
        if (!text) {
          console.error('❌ Texte de recherche manquant');
          process.exit(1);
        }
        result = await sendCommand('find.text', { text });
        break;
      }

      case 'goto.text':
      case 'goto-text': {
        const text = rest.join(' ');
        if (!text) {
          console.error('❌ Texte cible manquant');
          process.exit(1);
        }
        result = await sendCommand('goto.text', { text });
        break;
      }

      case 'status': {
        result = await sendCommand('ping', {});
        break;
      }

      default:
        console.error(`❌ Commande inconnue: ${command}`);
        console.error(`   Utilisez sans arguments pour voir l'aide.`);
        process.exit(1);
    }

    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`❌ Erreur: ${err.message}`);
    if (err.message.includes('ECONNREFUSED')) {
      console.error('   Le serveur bridge ne semble pas tourner. Lancez: npm start');
    }
    process.exit(1);
  }
}

main();
