#!/usr/bin/env node
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const readline = require('node:readline');
const { spawn } = require('child_process');

const VERSION = '3.2.6';
const WS_URL = process.env.BRIDGE_URL || 'ws://localhost:8080/ws/browser-bridge';
let spawnedServer = null;

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

async function connectOrStart() {
  try {
    return await connect();
  } catch (err) {
    if (err?.code !== 'ECONNREFUSED') throw err;
    spawnedServer = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'src/server.ts'], {
      cwd: process.cwd(),
      env: { ...process.env, BRIDGE_BRING_TO_FRONT: process.env.BRIDGE_BRING_TO_FRONT ?? '1' },
      stdio: ['ignore', 'ignore', 'ignore'],
      detached: process.platform !== 'win32',
      windowsHide: true,
    });
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        return await connect();
      } catch {}
    }
    throw new Error('Unable to start browser bridge on ' + WS_URL);
  }
}

function optionPayload(args) {
  const payload = {};
  const positional = [];
  for (const arg of args) {
    if (arg.startsWith('--limit=')) payload.limit = Number(arg.slice('--limit='.length));
    else if (arg.startsWith('--format=')) payload.format = arg.slice('--format='.length);
    else if (arg.startsWith('--out=')) payload.out = arg.slice('--out='.length);
    else positional.push(arg);
  }
  return { payload, positional };
}

function parseArgs(line) {
  const args = [];
  let current = '';
  let quote = null;
  for (const ch of line) {
    if (quote) {
      if (ch === quote) { quote = null; continue; }
      current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ' ') {
      if (current) { args.push(current); current = ''; }
    } else {
      current += ch;
    }
  }
  if (current) args.push(current);
  return args;
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

function showHelp() {
  console.log(`
AgentBridge CLI v${VERSION}

Usage: agentbridge <command> [args]

Commands:
  navigate <url>          Go to URL
  annotate                Screenshot + element list
  click <ref>             Click element by ref number
  type <ref> <text>       Type text into element
  press <key>             Press Enter, Tab, Escape
  scroll [dir] [amount]   Scroll down/up (default: down 300)
  discover [steps] [px]   Slowly scroll and capture page states
  screenshot [--full-page] Capture and save a screenshot
  extract [type]          Extract structured data (article|table|form|listings|marketplace)
  scrape [opts]           Extract marketplace results (opts: --limit=10 --format=json|csv --out=file)
  webSearch <query>       Search the web and auto-paginate results
  siteSearch <query>      Use the current site's visible search form
  visibleText [opts]      Extract visible DOM text nodes/elements
  scan [opts]             Read visible text, scroll, and repeat
  findText <text>         Find visible text, scrolling if needed
  clickText <text>        Click visible text, scrolling if needed
  idle [ms]               Move around and pause like a reader
  jitter [radius] [n]     Small cursor hesitation movements
  skim [steps] [px]       Scroll/read with pauses
  backtrack               Small upward scroll and pause
  focusCycle [n]          Press Tab through focusable controls
  back / forward          Browser history with human pause
  timing get              Show consultation timing profile
  timing set k=v ...      Adjust consultation timings live
  timing reset            Restore default timing profile
  antispam                Check current page anti-spam state
  summary                 Page summary (URL, title, elements)
  wait [ms]               Wait milliseconds (default: 2000)
  batch <recipe.json>     Run multiple commands from a JSON recipe file
  run <cmd1> <args1> <cmd2> <args2> ...  Run multiple commands in sequence
  repl                    Interactive REPL mode (type "exit" to quit)
  version                 Print version number
  help                    Show this help

Environment:
  BRIDGE_URL              WebSocket URL (default: ws://localhost:8080/ws/browser-bridge)

Examples:
  agentbridge navigate https://example.com
  agentbridge annotate
  agentbridge click 7
  agentbridge extract marketplace --limit=10
  agentbridge run "navigate https://google.com" "annotate" "click 3" "summary"
  agentbridge repl
`);
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
    const { payload } = optionPayload(args);
    const positional = args.filter((arg, i) => {
      if (arg.startsWith('--limit=') || arg.startsWith('--format=') || arg.startsWith('--out=')) return false;
      if (arg.startsWith('--engine=') || arg.startsWith('--pages=')) return false;
      if (['--limit', '--format', '--out'].includes(arg)) return false;
      if (['--limit', '--format', '--out'].includes(args[i - 1])) return false;
      return true;
    });
    const type = positional[0] || 'article';
    const r = await send(ws, { id: 'ext', type: 'dom.extract', payload: { type, limit: payload.limit, format: payload.format } });
    if (payload.out) {
      const content = payload.format === 'csv' && r.csv ? r.csv : JSON.stringify(r, null, 2);
      fs.writeFileSync(path.resolve(payload.out), content, 'utf8');
      print({ saved: path.resolve(payload.out), count: r.count ?? r.listings?.length ?? r.results?.length ?? 0 });
      return;
    }
    print(r);
  },

  async scrape(ws, args) {
    const { payload } = optionPayload(args);
    const r = await send(ws, { id: 'scrape', type: 'scrape.results', payload: { type: 'marketplace', limit: payload.limit, format: payload.format } });
    if (payload.out) {
      const content = payload.format === 'csv' && r.csv ? r.csv : JSON.stringify(r, null, 2);
      fs.writeFileSync(path.resolve(payload.out), content, 'utf8');
      print({ saved: path.resolve(payload.out), count: r.count ?? r.items?.length ?? 0 });
      return;
    }
    print(r);
  },

  async webSearch(ws, args) {
    const { payload, positional } = optionPayload(args);
    const engineArg = args.find((arg) => arg.startsWith('--engine='));
    const pagesArg = args.find((arg) => arg.startsWith('--pages='));
    const query = positional.filter((arg) => !arg.startsWith('--engine=') && !arg.startsWith('--pages=') && arg !== '--direct' && arg !== '--organic').join(' ');
    if (!query) throw new Error('Usage: webSearch <query> [--limit=20] [--engine=google] [--pages=3] [--direct] [--organic]');
    const r = await send(ws, {
      id: 'web-search',
      type: 'web.search',
      payload: {
        query,
        limit: payload.limit,
        engine: engineArg ? engineArg.slice('--engine='.length) : undefined,
        pages: pagesArg ? Number(pagesArg.slice('--pages='.length)) : undefined,
        useForm: !args.includes('--direct'),
        organicOnly: args.includes('--organic'),
      },
    });
    if (payload.out) {
      fs.writeFileSync(path.resolve(payload.out), JSON.stringify(r, null, 2), 'utf8');
      print({ saved: path.resolve(payload.out), count: r.count ?? r.results?.length ?? 0, status: r.status });
      return;
    }
    print(r);
  },

  async siteSearch(ws, args) {
    const query = args.filter((arg) => !arg.startsWith('--')).join(' ');
    const fieldArg = args.find((arg) => arg.startsWith('--field='));
    if (!query) throw new Error('Usage: siteSearch <query> [--field=Recherche]');
    const r = await send(ws, {
      id: 'site-search',
      type: 'form.search',
      payload: { query, field: fieldArg ? fieldArg.slice('--field='.length) : undefined },
    });
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

  async version() {
    console.log(VERSION);
  },

  async repl(ws, args) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'bridge> ' });
    console.log('AgentBridge REPL. Type "help" for commands, "exit" to quit.\n');
    rl.prompt();
    for await (const line of rl) {
      if (!line.trim()) { rl.prompt(); continue; }
      const parsed = parseArgs(line.trim());
      const cmd = parsed[0];
      const cargs = parsed.slice(1);
      if (cmd === 'exit' || cmd === 'quit') break;
      if (cmd === 'help') { showHelp(); rl.prompt(); continue; }
      const fn = commands[cmd];
      if (!fn) {
        const alias = kebabToCamel(cmd);
        const afn = commands[alias];
        if (afn) {
          try { await afn(ws, cargs); } catch (e) { console.error(e.message); }
        } else {
          console.error(`Unknown command: ${cmd}`);
        }
        rl.prompt();
        continue;
      }
      try { await fn(ws, cargs); } catch (e) { console.error(e.message); }
      rl.prompt();
    }
    rl.close();
  },

  async run(ws, args) {
    const line = args.join(' ');
    const tokens = parseArgs(line);
    const steps = [];
    let i = 0;
    while (i < tokens.length) {
      const cmd = tokens[i++];
      const stepArgs = [];
      while (i < tokens.length && !commands[tokens[i]] && !kebabToCamel(tokens[i])) {
        stepArgs.push(tokens[i++]);
      }
      steps.push({ cmd, args: stepArgs });
    }
    for (const step of steps) {
      const resolved = kebabToCamel(step.cmd) || step.cmd;
      const fn = commands[resolved];
      if (!fn || ['repl', 'version', 'batch', 'start'].includes(resolved)) continue;
      console.log(`\n>>> ${step.cmd} ${step.args.join(' ')}`);
      await fn(ws, step.args);
    }
  },

  async start() {
    console.log('Starting AgentBridge server...');
    const child = spawn(process.execPath, [require.resolve('./bridge-cli.cjs'), 'navigate', 'about:blank'], {
      env: { ...process.env },
      stdio: 'inherit',
    });
    child.on('error', (e) => console.error('Failed to start server:', e.message));
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

function kebabToCamel(cmd) {
  const map = {
    'visible-text': 'visibleText',
    'find-text': 'findText',
    'click-text': 'clickText',
    'focus-cycle': 'focusCycle',
    'web-search': 'webSearch',
    'site-search': 'siteSearch',
  };
  return map[cmd] || null;
}

async function main() {
  if (process.argv.includes('--version') || process.argv.includes('-v')) {
    console.log(VERSION);
    process.exit(0);
  }
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd || cmd === 'help') { showHelp(); process.exit(0); }

  const resolved = kebabToCamel(cmd) || cmd;
  const fn = commands[resolved];
  if (!fn) {
    console.error(`Unknown command: ${cmd}. Run 'agentbridge help' for usage.`);
    process.exit(1);
  }

  if (resolved === 'version') { fn(); process.exit(0); }

  const needsServer = !['start'].includes(resolved);
  const ws = needsServer ? await connectOrStart() : null;
  try {
    if (resolved === 'start') { fn(); return; }
    await fn(ws, args);
  } finally {
    if (ws) ws.close();
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
