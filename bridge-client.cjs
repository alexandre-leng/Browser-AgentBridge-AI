const WebSocket = require('ws');

const WS_URL = 'ws://localhost:8080/ws/browser-bridge';

async function sendCommand(ws, cmd) {
  return new Promise((resolve, reject) => {
    const handler = (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.id === cmd.id) {
          ws.off('message', handler);
          resolve(msg);
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

  // 1. Navigate to DuckDuckGo
  console.log('--- Navigating to DuckDuckGo ---');
  let r = await sendCommand(ws, { id: '1', type: 'navigate', payload: { url: 'https://duckduckgo.com' } });
  console.log(JSON.stringify(r, null, 2));

  // Wait a bit for page load
  await new Promise(r => setTimeout(r, 2000));

  // 2. Annotate
  console.log('--- Annotating DuckDuckGo ---');
  r = await sendCommand(ws, { id: '2', type: 'page.annotate', payload: {} });
  console.log(JSON.stringify(r, null, 2));

  // Find search input ref
  let searchRef = null;
  if (r.ok && r.result && r.result.elements) {
    for (const el of r.result.elements) {
      if (el.role === 'searchbox' || (el.name && el.name.toLowerCase().includes('search')) || el.tag === 'input') {
        searchRef = el.id;
        break;
      }
    }
  }

  if (!searchRef) {
    // Fallback: try to find by text
    for (const el of r.result.elements) {
      if (el.text && (el.text.includes('Search') || el.text.includes('Searches'))) {
        searchRef = el.id;
        break;
      }
    }
  }

  console.log('Search ref:', searchRef);

  if (searchRef) {
    // 3. Type search query
    console.log('--- Typing "formalibre" ---');
    r = await sendCommand(ws, { id: '3', type: 'agent.type', payload: { ref: searchRef, text: 'formalibre', clear: true } });
    console.log(JSON.stringify(r, null, 2));

    // 4. Press Enter
    console.log('--- Pressing Enter ---');
    r = await sendCommand(ws, { id: '4', type: 'agent.press', payload: { key: 'Enter' } });
    console.log(JSON.stringify(r, null, 2));

    // Wait for results
    await new Promise(r => setTimeout(r, 3000));

    // 5. Annotate results
    console.log('--- Annotating search results ---');
    r = await sendCommand(ws, { id: '5', type: 'page.annotate', payload: {} });
    console.log(JSON.stringify(r, null, 2));

    // Find formalibre link
    let formalibreRef = null;
    if (r.ok && r.result && r.result.elements) {
      for (const el of r.result.elements) {
        const txt = (el.text || el.name || '').toLowerCase();
        if (txt.includes('formalibre') || txt.includes('forma-libre')) {
          formalibreRef = el.id;
          break;
        }
      }
    }

    console.log('FormaLibre ref:', formalibreRef);

    if (formalibreRef) {
      // 6. Click formalibre link
      console.log('--- Clicking formalibre link ---');
      r = await sendCommand(ws, { id: '6', type: 'agent.click', payload: { ref: formalibreRef } });
      console.log(JSON.stringify(r, null, 2));

      // Wait for page load
      await new Promise(r => setTimeout(r, 4000));

      // 7. Annotate formalibre site
      console.log('--- Annotating formalibre site ---');
      r = await sendCommand(ws, { id: '7', type: 'page.annotate', payload: {} });
      console.log(JSON.stringify(r, null, 2));

      // 8. Try to extract portfolio / profiles
      console.log('--- Extracting data ---');
      r = await sendCommand(ws, { id: '8', type: 'dom.extract', payload: { type: 'article' } });
      console.log(JSON.stringify(r, null, 2));

      // Also get summary
      console.log('--- Getting summary ---');
      r = await sendCommand(ws, { id: '9', type: 'agent.summary', payload: {} });
      console.log(JSON.stringify(r, null, 2));
    }
  }

  ws.close();
}

main().catch(e => { console.error(e); process.exit(1); });
