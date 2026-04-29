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
        if (msg.type === 'human.feedback') {
          console.error(JSON.stringify(msg.payload));
          return;
        }
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
  if (result && (result.imageBase64 || result.image)) {
    const out = { ...result };
    delete out.imageBase64;
    delete out.image;
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

  async discover(ws, args) {
    const steps = parseInt(args[0]) || 5;
    const amount = parseInt(args[1]) || 650;
    const r = await send(ws, { id: 'dsc', type: 'agent.discoverScroll', payload: { steps, amount } });
    print(r);
  },

  async screenshot(ws, args) {
    const r = await send(ws, { id: 'shot', type: 'vision.screenshot', payload: { fullPage: args.includes('--full-page') } });
    print(r);
  },

  async extract(ws, args) {
    const type = args[0] || 'article';
    const r = await send(ws, { id: 'ext', type: 'dom.extract', payload: { type } });
    print(r);
  },

  async visibleText(ws, args) {
    const payload = {};
    for (const arg of args) {
      if (arg.startsWith('--filter=')) payload.textFilter = arg.slice('--filter='.length);
      else if (arg.startsWith('--query=')) payload.query = arg.slice('--query='.length);
      else if (arg.startsWith('--limit=')) payload.limit = Number(arg.slice('--limit='.length));
    }
    const r = await send(ws, { id: 'txt', type: 'dom.visibleText', payload });
    print(r);
  },

  async scan(ws, args) {
    const payload = {};
    for (const arg of args) {
      if (arg.startsWith('--steps=')) payload.steps = Number(arg.slice('--steps='.length));
      else if (arg.startsWith('--amount=')) payload.amount = Number(arg.slice('--amount='.length));
      else if (arg.startsWith('--filter=')) payload.textFilter = arg.slice('--filter='.length);
    }
    if (!payload.steps && args[0] && !args[0].startsWith('--')) payload.steps = Number(args[0]) || 4;
    const r = await send(ws, { id: 'scn', type: 'human.scan', payload });
    print(r);
  },

  async findText(ws, args) {
    const text = args.join(' ');
    if (!text) throw new Error('Usage: findText <visible text>');
    const r = await send(ws, { id: 'fnd', type: 'human.findText', payload: { text } });
    print(r);
  },

  async clickText(ws, args) {
    const text = args.join(' ');
    if (!text) throw new Error('Usage: clickText <visible text>');
    const r = await send(ws, { id: 'ctx', type: 'human.clickText', payload: { text } });
    print(r);
  },

  async idle(ws, args) {
    const r = await send(ws, { id: 'idl', type: 'human.idle', payload: { durationMs: Number(args[0]) || undefined } });
    print(r);
  },

  async jitter(ws, args) {
    const r = await send(ws, { id: 'jit', type: 'human.jitter', payload: { radius: Number(args[0]) || undefined, moves: Number(args[1]) || undefined } });
    print(r);
  },

  async skim(ws, args) {
    const r = await send(ws, { id: 'skm', type: 'human.skim', payload: { steps: Number(args[0]) || undefined, amount: Number(args[1]) || undefined } });
    print(r);
  },

  async backtrack(ws) {
    const r = await send(ws, { id: 'bkt', type: 'human.backtrack', payload: {} });
    print(r);
  },

  async focusCycle(ws, args) {
    const r = await send(ws, { id: 'fcy', type: 'human.focusCycle', payload: { times: Number(args[0]) || undefined } });
    print(r);
  },

  async back(ws) {
    const r = await send(ws, { id: 'bak', type: 'human.goBack', payload: {} });
    print(r);
  },

  async forward(ws) {
    const r = await send(ws, { id: 'fwd', type: 'human.goForward', payload: {} });
    print(r);
  },

  async timing(ws, args) {
    const action = args[0] || 'get';
    if (action === 'get') {
      const r = await send(ws, { id: 'tmg', type: 'human.timing.get', payload: {} });
      print(r);
      return;
    }
    if (action === 'reset') {
      const r = await send(ws, { id: 'tmr', type: 'human.timing.reset', payload: {} });
      print(r);
      return;
    }
    if (action !== 'set') throw new Error('Usage: timing get|reset|set key=value ...');
    const payload = {};
    for (const arg of args.slice(1)) {
      const idx = arg.indexOf('=');
      if (idx <= 0) continue;
      payload[arg.slice(0, idx)] = Number(arg.slice(idx + 1));
    }
    const r = await send(ws, { id: 'tms', type: 'human.timing.set', payload });
    print(r);
  },

  async antispam(ws) {
    const r = await send(ws, { id: 'asp', type: 'human.antispam.check', payload: {} });
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
  discover [steps] [px]    Slowly scroll and capture page states
  screenshot [--full-page] Capture and save a screenshot
  extract [type]          Extract structured data (article|table|form)
  visibleText [opts]      Extract visible DOM text nodes/elements
  scan [opts]             Read visible text, scroll, and repeat
  findText <text>         Find visible text, scrolling if needed
  clickText <text>        Click visible text, scrolling if needed
  idle [ms]               Move around and pause like a reader
  jitter [radius] [n]     Small cursor hesitation movements
  skim [steps] [px]       Scroll/read with pauses and occasional backtrack
  backtrack               Small upward scroll and pause
  focusCycle [n]          Press Tab through focusable controls
  back / forward          Browser history with human pause
  timing get              Show consultation timing profile
  timing set k=v ...      Adjust consultation timings live
  timing reset            Restore default timing profile
  antispam                Check current page anti-spam state
  summary                 Page summary (URL, title, elements)
  wait [ms]               Wait milliseconds (default: 2000)
  batch <recipe.json>     Run multiple commands from a JSON file

Examples:
  node bridge-cli.cjs navigate https://example.com
  node bridge-cli.cjs annotate
  node bridge-cli.cjs click 7
  node bridge-cli.cjs extract article
  node bridge-cli.cjs visibleText --filter="Numéro|06|Adresse" --limit=50
  node bridge-cli.cjs scan --steps=4 --filter="Restaurant|Adresse|Numéro"
  node bridge-cli.cjs clickText "Le Ramus"
  node bridge-cli.cjs idle 2500
  node bridge-cli.cjs skim 4 420
  node bridge-cli.cjs timing set consultSpeed=1.6 minFocusedMs=3500 feedbackIntervalMs=800
  node bridge-cli.cjs antispam

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
  if (!fn && cmd === 'visible-text') {
    const ws = await connect();
    try {
      await commands.visibleText(ws, args);
    } finally {
      ws.close();
    }
    return;
  }
  if (!fn && cmd === 'find-text') {
    const ws = await connect();
    try {
      await commands.findText(ws, args);
    } finally {
      ws.close();
    }
    return;
  }
  if (!fn && cmd === 'click-text') {
    const ws = await connect();
    try {
      await commands.clickText(ws, args);
    } finally {
      ws.close();
    }
    return;
  }
  if (!fn && cmd === 'focus-cycle') {
    const ws = await connect();
    try {
      await commands.focusCycle(ws, args);
    } finally {
      ws.close();
    }
    return;
  }
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
