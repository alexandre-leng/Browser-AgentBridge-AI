#!/usr/bin/env node
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const WS_URL = 'ws://localhost:8080/ws/browser-bridge';

function send(ws, cmd) {
  return new Promise((resolve, reject) => {
    const handler = (data) => {
      try {
        const msg = JSON.parse(data.toString());
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

async function connect() {
  const ws = new WebSocket(WS_URL);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  return ws;
}

function print(result) {
  if (result && result.imageBase64) {
    const out = { ...result };
    delete out.imageBase64;
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}

const commands = {
  async navigate(ws, args) {
    const url = args[0];
    if (!url) throw new Error('Usage: navigate <url>');
    const r = await send(ws, { id: 'nav', type: 'navigate', payload: { url } });
    print(r);
  },

  async annotate(ws, args) {
    const r = await send(ws, { id: 'ann', type: 'page.annotate', payload: {} });
    print(r);
  },

  async click(ws, args) {
    const ref = parseInt(args[0]);
    if (isNaN(ref)) throw new Error('Usage: click <ref-number>');
    const r = await send(ws, { id: 'clk', type: 'agent.click', payload: { ref } });
    print(r);
  },

  async type(ws, args) {
    const ref = parseInt(args[0]);
    const text = args.slice(1).join(' ');
    if (isNaN(ref) || !text) throw new Error('Usage: type <ref-number> <text>');
    const r = await send(ws, { id: 'typ', type: 'agent.type', payload: { ref, text, clear: true } });
    print(r);
  },

  async press(ws, args) {
    const key = args[0];
    if (!key) throw new Error('Usage: press <Enter|Tab|Escape>');
    const r = await send(ws, { id: 'prs', type: 'agent.press', payload: { key } });
    print(r);
  },

  async scroll(ws, args) {
    const direction = args[0] || 'down';
    const amount = parseInt(args[1]) || 300;
    const r = await send(ws, { id: 'scr', type: 'agent.scroll', payload: { direction, amount } });
    print(r);
  },

  async extract(ws, args) {
    const type = args[0] || 'article';
    const r = await send(ws, { id: 'ext', type: 'dom.extract', payload: { type } });
    print(r);
  },

  async summary(ws, args) {
    const r = await send(ws, { id: 'sum', type: 'agent.summary', payload: {} });
    print(r);
  },

  async wait(ws, args) {
    const ms = parseInt(args[0]) || 2000;
    await new Promise(r => setTimeout(r, ms));
    console.log(JSON.stringify({ waited: ms }));
  },

  async batch(ws, args) {
    const file = args[0];
    if (!file) throw new Error('Usage: batch <recipe.json>');
    const recipe = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const step of recipe.steps) {
      console.log(`\n>>> ${step.cmd} ${(step.args || []).join(' ')}`);
      const fn = commands[step.cmd];
      if (!fn) throw new Error(`Unknown command: ${step.cmd}`);
      await fn(ws, step.args || []);
    }
  }
};

async function main() {
  const [cmd, ...args] = process.argv.slice(2);

  if (!cmd || cmd === 'help') {
    console.log(`
Usage: node bridge-cli.cjs <command> [args]

Commands:
  navigate <url>          Go to URL
  annotate                Screenshot + element list
  click <ref>             Click element by ref number
  type <ref> <text>       Type text into element
  press <key>             Press Enter, Tab, Escape
  scroll [dir] [amount]   Scroll down/up (default: down 300)
  extract [type]          Extract structured data (article|table|form)
  summary                 Page summary (URL, title, elements)
  wait [ms]               Wait milliseconds (default: 2000)
  batch <recipe.json>     Run multiple commands from a JSON file

Examples:
  node bridge-cli.cjs navigate https://example.com
  node bridge-cli.cjs annotate
  node bridge-cli.cjs click 7
  node bridge-cli.cjs extract article

Batch recipe example (recipe.json):
  {
    "steps": [
      { "cmd": "navigate", "args": ["https://duckduckgo.com/?q=formalibre"] },
      { "cmd": "wait", "args": ["3000"] },
      { "cmd": "annotate" },
      { "cmd": "click", "args": ["25"] },
      { "cmd": "wait", "args": ["4000"] },
      { "cmd": "extract", "args": ["article"] }
    ]
  }
`);
    process.exit(0);
  }

  const fn = commands[cmd];
  if (!fn) {
    console.error(`Unknown command: ${cmd}. Run 'node bridge-cli.cjs help' for usage.`);
    process.exit(1);
  }

  const ws = await connect();
  try {
    await fn(ws, args);
  } finally {
    ws.close();
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
