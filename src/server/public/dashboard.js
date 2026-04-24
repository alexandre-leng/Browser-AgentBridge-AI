const ws = new WebSocket('ws://localhost:8080/ws/browser-bridge');
let commandId = 0;
let cmdCount = 0;
let resCount = 0;
let frameCount = 0;

ws.onopen = () => {
  setStatus(true);
  addLog('WebSocket connecté', 'info');
};

ws.onmessage = (event) => {
  try {
    const msg = JSON.parse(event.data);
    if (msg.type === 'vision.frame') {
      frameCount++;
      document.getElementById('frameCount').textContent = frameCount;
      addLog('Frame reçue : ' + msg.payload.viewport.width + 'x' + msg.payload.viewport.height, 'vision');
    } else if (msg.type === 'command.result') {
      resCount++;
      document.getElementById('resCount').textContent = resCount;
      addLog('[' + msg.commandId + '] ' + JSON.stringify(msg.payload).substring(0, 200), 'result');
    } else {
      addLog(msg.type + ' : ' + JSON.stringify(msg.payload).substring(0, 100), 'info');
    }
  } catch (e) {
    addLog('Message brut : ' + event.data.substring(0, 100));
  }
};

ws.onclose = () => {
  setStatus(false);
  addLog('WebSocket fermé', 'info');
};

const LOG_COLORS = {
  cmd:    'text-brand',
  result: 'text-green-400',
  vision: 'text-blue-400',
  info:   'text-yellow-400',
};

function setStatus(connected) {
  const dot = document.getElementById('dot');
  dot.classList.toggle('bg-green-400', connected);
  dot.classList.toggle('shadow-[0_0_6px_#4ade80]', connected);
  dot.classList.toggle('bg-red-500', !connected);
  document.getElementById('statusText').textContent = connected ? 'Connecté' : 'Déconnecté';
}

function addLog(message, type) {
  const log = document.getElementById('log');
  const time = new Date().toLocaleTimeString();
  const entry = document.createElement('div');
  entry.className = 'flex gap-2 px-1.5 py-0.5 rounded hover:bg-dark-800';
  const timeEl = document.createElement('span');
  timeEl.className = 'text-gray-600 shrink-0';
  timeEl.textContent = time;
  const textEl = document.createElement('span');
  textEl.className = (LOG_COLORS[type] || 'text-gray-400') + ' break-all';
  textEl.textContent = message;
  entry.appendChild(timeEl);
  entry.appendChild(textEl);
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}

function clearLog() {
  document.getElementById('log').textContent = '';
}

function sendCommand(type, payload) {
  commandId++;
  cmdCount++;
  document.getElementById('cmdCount').textContent = cmdCount;
  ws.send(JSON.stringify({ commandId: 'cmd-' + commandId, type, payload: payload || {} }));
  addLog('Envoyé : ' + type, 'cmd');
}

function sendSearch(engine) {
  sendCommand('search', { engine, query: document.getElementById('query').value });
}
function sendMouseMove() {
  sendCommand('mouse.move', { x: 500 + Math.random() * 300, y: 300 + Math.random() * 200, duration: 1000 });
}
function sendMouseClick() {
  sendCommand('mouse.click', { x: 500 + Math.random() * 300, y: 300 + Math.random() * 200 });
}
function sendScroll() {
  sendCommand('mouse.scroll', { amount: 500, direction: 'down' });
}
function sendHover() {
  sendCommand('mouse.hover', { selector: 'a[href]' });
}
function sendType() {
  sendCommand('keyboard.type', { text: document.getElementById('typeText').value, selector: 'input[name="q"], textarea' });
}
function sendKeyPress(key) {
  sendCommand('keyboard.press', { key });
}
function sendVision(type) {
  sendCommand(type, {});
}
function sendHuman(type) {
  sendCommand(type, {});
}
function sendNavigate() {
  sendCommand('navigate', { url: 'https://www.google.com', options: { humanBehavior: true } });
}
function sendExtract() {
  sendCommand('extract', { selector: 'h1, h2, h3', options: { multiple: true } });
}
function sendScreenshot() {
  sendCommand('screenshot', { format: 'png' });
}
function sendCombo(type) {
  sendCommand(type, { query: document.getElementById('query').value });
}

// === DOM INTERACTION ===

function buildDomTarget() {
  const selector = document.getElementById('domSelector').value.trim();
  const text = document.getElementById('domText').value.trim();
  const target = {};
  if (selector) target.selector = selector;
  if (text) target.text = text;
  return target;
}

function sendDomClick() {
  const target = buildDomTarget();
  if (!target.selector && !target.text) { addLog('⚠️ Remplissez un sélecteur ou un texte', 'info'); return; }
  sendCommand('dom.click', target);
}

function sendDomHover() {
  const target = buildDomTarget();
  if (!target.selector && !target.text) { addLog('⚠️ Remplissez un sélecteur ou un texte', 'info'); return; }
  sendCommand('dom.hover', target);
}

function sendDomType() {
  const target = buildDomTarget();
  const value = document.getElementById('typeText').value;
  if (!target.selector && !target.text) { addLog('⚠️ Remplissez un sélecteur ou un texte', 'info'); return; }
  sendCommand('dom.type', { ...target, value });
}

function sendDomInspect() {
  sendCommand('dom.inspect', {});
}

function closeDomInspect() {
  document.getElementById('domInspectResults').classList.add('hidden');
}

// Enhanced result handler for dom.inspect
let lastCommandType = null;
const originalSendCommand = sendCommand;
sendCommand = function(type, payload) {
  lastCommandType = type;
  originalSendCommand(type, payload);
};

// Override onmessage to handle dom.inspect results specially
const originalOnMessage = ws.onmessage;
ws.onmessage = (event) => {
  try {
    const msg = JSON.parse(event.data);

    // Special handling for dom.inspect results
    if (msg.type === 'command.result' && msg.payload && msg.payload.elements) {
      displayDomInspect(msg.payload);
    }

    if (msg.type === 'vision.frame') {
      frameCount++;
      document.getElementById('frameCount').textContent = frameCount;
      // Don't spam logs with vision frames
    } else if (msg.type === 'command.result') {
      resCount++;
      document.getElementById('resCount').textContent = resCount;

      // Pretty-print DOM results
      if (msg.payload && msg.payload.element) {
        const el = msg.payload.element;
        const status = msg.payload.success ? '✅' : '❌';
        const match = msg.payload.matchCount ? ` (${msg.payload.matchCount} match${msg.payload.matchCount > 1 ? 'es' : ''})` : '';
        addLog(`${status} [${msg.commandId}] <${el.tag}> "${el.text || el.placeholder || ''}"${match}`, 'result');
      } else {
        addLog('[' + msg.commandId + '] ' + JSON.stringify(msg.payload).substring(0, 200), 'result');
      }
    } else {
      addLog(msg.type + ' : ' + JSON.stringify(msg.payload).substring(0, 100), 'info');
    }
  } catch (e) {
    addLog('Message brut : ' + event.data.substring(0, 100));
  }
};

function displayDomInspect(data) {
  const container = document.getElementById('domInspectResults');
  const list = document.getElementById('domInspectList');
  list.innerHTML = '';

  container.classList.remove('hidden');

  // Header info
  const header = document.createElement('div');
  header.className = 'text-gray-400 mb-1 pb-1 border-b border-gray-800';
  header.textContent = `${data.count} éléments sur ${data.totalInteractive} (${data.title})`;
  list.appendChild(header);

  // Element list
  for (const el of (data.elements || [])) {
    const row = document.createElement('div');
    row.className = 'flex gap-2 items-baseline py-0.5 hover:bg-dark-800 rounded px-1 cursor-pointer group';

    const tag = document.createElement('span');
    tag.className = 'text-brand shrink-0 font-bold';
    tag.textContent = `<${el.tag}>`;

    const text = document.createElement('span');
    text.className = 'text-gray-300 truncate flex-1';
    text.textContent = el.text || el.placeholder || el.ariaLabel || el.href || '(vide)';

    const selector = document.createElement('span');
    selector.className = 'text-gray-600 shrink-0 hidden group-hover:inline';
    selector.textContent = el.selector;

    // Click to fill selector
    row.addEventListener('click', () => {
      document.getElementById('domSelector').value = el.id ? '#' + el.id : el.selector;
      document.getElementById('domText').value = el.text || '';
      addLog('🎯 Cible sélectionnée: ' + (el.id ? '#' + el.id : el.selector), 'cmd');
    });

    row.appendChild(tag);
    row.appendChild(text);
    row.appendChild(selector);
    list.appendChild(row);
  }

  addLog(`🔍 ${data.count} éléments interactifs trouvés`, 'result');
}

setInterval(() => {
  fetch('/api/clients')
    .then(r => r.json())
    .then(data => { document.getElementById('clientCount').textContent = data.count; })
    .catch(() => {});
}, 2000);

