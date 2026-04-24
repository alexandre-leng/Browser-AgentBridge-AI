/**
 * OpenClaw Browser Bridge - CLI Live Utility
 * Permet d'envoyer des commandes au bridge en temps réel.
 * Usage: node live.js <command> [payload_json]
 * Example: node live.js mouse.click '{"text": "Google"}'
 */

const WebSocket = require('ws');

const args = process.argv.slice(2);
const WS_URL = 'ws://localhost:8080/ws/browser-bridge';

if (args.length === 0 || args[0] === '--help') {
  console.log(`
🚀 OpenClaw Live CLI
Usage: node live.js <command> [payload]
       node live.js --repl

Exemples:
  node live.js navigate '{"url": "https://google.com"}'
  node live.js mouse.click '{"text": "Recherche Google"}'
  node live.js dom.extract '{"type": "full"}'
  node live.js keyboard.type '{"text": "Hello World"}'
  `);
  process.exit(0);
}

// Fonction de parsing intelligent (alias pour IA)
function parseCommand(args) {
  let type = args[0];
  let payloadStr = args[1];
  let payload = {};

  if (!type) return null;

  // Alias ultra-simples
  if (type === 'goto') {
    type = 'navigate';
    payload = { url: payloadStr };
  } else if (type === 'read') {
    type = 'dom.extract';
  } else if (type === 'html') {
    type = 'dom.html';
  } else if (type === 'search') {
    type = 'dom.search';
    payload = { query: payloadStr };
  } else if (type === 'click') {
    type = 'action.click';
    payload = { query: payloadStr };
  } else if (type === 'hover') {
    type = 'action.hover';
    payload = { query: payloadStr };
  } else if (type === 'scroll') {
    type = 'mouse.scroll';
    payload = { y: parseInt(payloadStr) || 500 };
  } else if (type === 'type') {
    type = 'keyboard.type';
    // Si args[2] est fourni, args[1] est le selecteur/texte, args[2] est le texte à taper
    if (args[2]) {
      payload = { query: args[1], value: args[2] };
    } else {
      payload = { query: payloadStr };
    }
  } else if (payloadStr) {
    try {
      payload = JSON.parse(payloadStr);
    } catch (e) {
      console.error('❌ Erreur: Payload JSON invalide');
      return null;
    }
  }

  return { type, payload };
}

// Mode REPL (Interactif)
if (args[0] === '--repl') {
  startRepl();
} else {
  // Mode One-shot
  const cmd = parseCommand(args);
  if (!cmd) process.exit(1);
  sendCommand(cmd.type, cmd.payload);
}

/**
 * Envoie une commande unique et attend la réponse
 */
async function sendCommand(type, payload) {
  const ws = new WebSocket(WS_URL);
  const commandId = `live-${Date.now()}`;

  ws.on('open', () => {
    // S'identifier comme dashboard
    ws.send(JSON.stringify({ type: 'bridge.identify', clientType: 'dashboard' }));
    
    // Envoyer la commande
    ws.send(JSON.stringify({ type, commandId, payload }));
    console.log(`📡 [Envoi] ${type}...`);
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      
      // Ignorer les heartbeats et les frames de vision
      if (msg.type === 'bridge.heartbeat' || msg.type === 'vision.frame') return;

      if (msg.commandId === commandId || msg.type === 'command.result') {
        console.log('\n✅ [Réponse reçue]');
        console.log(JSON.stringify(msg.payload || msg, null, 2));
        ws.close();
        process.exit(0);
      }
    } catch (e) {}
  });

  ws.on('error', (err) => {
    console.error('❌ Erreur de connexion:', err.message);
    process.exit(1);
  });

  // Timeout
  setTimeout(() => {
    console.error('⏱️ Timeout: Pas de réponse du bridge.');
    process.exit(1);
  }, 15000);
}

/**
 * Démarre une session interactive
 */
function startRepl() {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'OpenClaw > '
  });

  const ws = new WebSocket(WS_URL);
  
  ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'bridge.identify', clientType: 'dashboard' }));
    console.log('✅ Connecté au bridge. Tapez votre commande (ex: navigate {"url":"..."})');
    rl.prompt();
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'bridge.heartbeat' || msg.type === 'vision.frame') return;
    console.log('\n📥 Result:', JSON.stringify(msg.payload || msg, null, 2));
    rl.prompt();
  });

  rl.on('line', (line) => {
    const parts = line.trim().split(' ');
    if (parts.length === 0 || !parts[0]) { rl.prompt(); return; }

    // On utilise la même logique que le mode one-shot (alias IA + payload optionnel)
    // On passe directement l'array pour simuler les arguments CLI
    const cmd = parseCommand(parts);

    if (cmd && cmd.type) {
      ws.send(JSON.stringify({ type: cmd.type, commandId: `repl-${Date.now()}`, payload: cmd.payload }));
    } else {
      rl.prompt();
    }
  });

  rl.on('close', () => {
    console.log('\nFin de session.');
    ws.close();
    process.exit(0);
  });
}
