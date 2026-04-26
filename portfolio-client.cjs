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

  // 1. Navigate directly to portfolio
  console.log('--- Navigating to formalibre portfolio ---');
  let r = await sendCommand(ws, { id: '1', type: 'navigate', payload: { url: 'https://www.formalibre.org/portfolio' } });
  console.log(JSON.stringify(r, null, 2));

  // Wait for page load
  await new Promise(r => setTimeout(r, 4000));

  // 2. Annotate
  console.log('--- Annotating portfolio page ---');
  r = await sendCommand(ws, { id: '2', type: 'page.annotate', payload: {} });
  console.log(JSON.stringify(r, null, 2));

  // 3. Extract articles / profiles
  console.log('--- Extracting articles ---');
  r = await sendCommand(ws, { id: '3', type: 'dom.extract', payload: { type: 'article' } });
  console.log(JSON.stringify(r, null, 2));

  // 4. Get HTML for deeper inspection
  console.log('--- Getting HTML ---');
  r = await sendCommand(ws, { id: '4', type: 'dom.html', payload: { selector: 'body' } });
  console.log(JSON.stringify(r, null, 2));

  ws.close();
}

main().catch(e => { console.error(e); process.exit(1); });
