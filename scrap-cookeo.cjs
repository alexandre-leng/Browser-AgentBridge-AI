const WebSocket = require('ws');
const WS_URL = 'ws://localhost:8080/ws/browser-bridge';

function sendCommand(ws, cmd) {
  return new Promise((resolve) => {
    const handler = (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.id === cmd.id) { ws.off('message', handler); resolve(msg); }
      } catch (e) {}
    };
    ws.on('message', handler);
    ws.send(JSON.stringify(cmd));
  });
}

let nextId = Date.now();
function id() { return (nextId++).toString(); }

async function main() {
  const ws = new WebSocket(WS_URL);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  // 1. Get current page info
  let r = await sendCommand(ws, { id: id(), type: 'navigate.info', payload: {} });
  console.log('Current URL:', r.result?.url);
  console.log('Title:', r.result?.title);

  // 2. Try to get all visible elements to find search input
  r = await sendCommand(ws, { id: id(), type: 'dom.visibleText', payload: {} });
  if (r.ok && r.result && r.result.items) {
    // Find the search input elements
    const inputs = r.result.items.filter(e => e.role === 'combobox' || e.tag === 'input');
    console.log('Found inputs:', inputs.length);
    inputs.forEach((inp, i) => console.log(`  [${i}] role=${inp.role} tag=${inp.tag} text="${inp.text?.substring(0, 80)}" selector="${inp.selector}"`));

    // Find the one that looks like a search box
    const searchInput = r.result.items.find(e => e.selector?.includes('search') || e.selector?.includes('Search'));
    if (searchInput) {
      console.log('\nTrying to focus via JS...');
      r = await sendCommand(ws, { id: id(), type: 'script.execute', payload: { script: `document.querySelector('${searchInput.selector}')?.focus();` } });
      console.log('focus:', r.ok);
    } else {
      // Try the combobox directly - select it by aria-label
      console.log('\nTrying to find and fill combobox via script...');
      r = await sendCommand(ws, {
        id: id(), type: 'script.execute',
        payload: {
          script: `
            const inputs = document.querySelectorAll('input, [role="combobox"]');
            for (const inp of inputs) {
              if (inp.offsetParent !== null) {
                inp.focus();
                inp.value = 'cookeo cuve bon etat';
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                inp.dispatchEvent(new Event('change', { bubbles: true }));
                console.log('Filled input:', inp.outerHTML?.substring(0, 200));
                break;
              }
            }
          `
        }
      });
      console.log('script result:', r.ok, r.result);
    }

    await new Promise(r => setTimeout(r, 1000));

    // Now try to submit - find the search button
    const buttons = r.result.items.filter(e => e.text?.includes('Valider') || e.text?.includes('Rechercher'));
    console.log('Search buttons:', buttons.length);

    // Press Enter as fallback
    r = await sendCommand(ws, { id: id(), type: 'agent.press', payload: { key: 'Enter' } });
    console.log('Enter pressed:', r.ok);

    await new Promise(r => setTimeout(r, 4000));

    // Check what page we're on now
    r = await sendCommand(ws, { id: id(), type: 'navigate.info', payload: {} });
    console.log('\nAfter search URL:', r.result?.url);

    // Extract content
    r = await sendCommand(ws, { id: id(), type: 'dom.visibleText', payload: {} });
    if (r.ok && r.result && r.result.items) {
      // Find the main content
      const fullText = r.result.items.map(i => i.text).join(' ').substring(0, 10000);
      console.log('\n=== PAGE CONTENT (first 10000 chars) ===');
      console.log(fullText);
    }
  }

  ws.close();
}

main().catch(e => { console.error(e); process.exit(1); });
