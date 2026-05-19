#!/usr/bin/env node
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const readline = require('node:readline');
const { spawn } = require('child_process');

const VERSION = '3.3.0';
const WS_URL = process.env.BRIDGE_URL || 'ws://localhost:8080/ws/browser-bridge';
let spawnedServer = null;

const isFast = () => process.env.BRIDGE_SCRAPE_SPEED === 'fast';

function send(ws, cmd) {
  return new Promise((resolve, reject) => {
    const handler = (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'human.feedback') {
          process.stderr.write(JSON.stringify(msg.payload) + '\n');
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
    const serverCmd = isFast()
      ? [path.resolve(__dirname, '..', 'dist', 'server.js')]
      : ['node_modules/tsx/dist/cli.mjs', 'src/server.ts'];
    spawnedServer = spawn(process.execPath, serverCmd, {
      cwd: isFast() ? undefined : process.cwd(),
      env: { ...process.env, BRIDGE_BRING_TO_FRONT: process.env.BRIDGE_BRING_TO_FRONT ?? '1' },
      stdio: ['ignore', 'ignore', 'ignore'],
      detached: process.platform !== 'win32',
      windowsHide: true,
    });
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try { return await connect(); } catch {}
    }
    throw new Error('Unable to start browser bridge on ' + WS_URL);
  }
}

function parseOpts(args, knownFlags = []) {
  const opts = {};
  const positional = [];
  for (const arg of args) {
    if (arg.startsWith('--limit=')) opts.limit = Number(arg.slice('--limit='.length));
    else if (arg.startsWith('--format=')) opts.format = arg.slice('--format='.length);
    else if (arg.startsWith('--out=')) opts.out = arg.slice('--out='.length);
    else if (arg.startsWith('--engine=')) opts.engine = arg.slice('--engine='.length);
    else if (arg.startsWith('--pages=')) opts.pages = Number(arg.slice('--pages='.length));
    else if (arg.startsWith('--filter=')) opts.filter = arg.slice('--filter='.length);
    else if (arg.startsWith('--query=')) opts.query = arg.slice('--query='.length);
    else if (arg.startsWith('--steps=')) opts.steps = Number(arg.slice('--steps='.length));
    else if (arg === '--fast') opts.fast = true;
    else if (arg === '--emails') opts.emails = true;
    else if (arg === '--phones') opts.phones = true;
    else if (arg === '--full-page') opts.fullPage = true;
    else if (arg === '--direct') opts.direct = true;
    else if (arg === '--organic') opts.organic = true;
    else if (arg === '--csv') opts.format = 'csv';
    else if (arg === '--json') opts.format = 'json';
    else if (arg === '--json-lines') opts.jsonLines = true;
    else if (arg.startsWith('--')) { /* ignore unknown flags */ }
    else positional.push(arg);
  }
  return { opts, positional };
}

function parseArgs(line) {
  const args = [];
  let current = '';
  let quote = null;
  for (const ch of line) {
    if (quote) { if (ch === quote) { quote = null; continue; } current += ch; }
    else if (ch === '"' || ch === "'") { quote = ch; }
    else if (ch === ' ') { if (current) { args.push(current); current = ''; } }
    else { current += ch; }
  }
  if (current) args.push(current);
  return args;
}

function printJson(data) {
  const prefix = process.env.BRIDGE_JSON_LINES ? '' : '';
  const output = JSON.stringify(data);
  if (process.env.BRIDGE_JSON_LINES) {
    process.stdout.write(output.replace(/\n/g, '\\n') + '\n');
  } else {
    console.log(output);
  }
}

function writeOut(data, opts, defaultExt = 'json') {
  const fmt = opts.format || defaultExt;
  const filePath = opts.out;
  if (!filePath) { printJson(data); return; }
  const resolved = path.resolve(filePath);
  if (fmt === 'csv') {
    const headers = Object.keys(data);
    const rows = Array.isArray(data) ? data : [data];
    const lines = [headers.join(',')];
    for (const row of rows) {
      lines.push(headers.map(h => {
        const v = row[h];
        if (v === null || v === undefined) return '';
        const s = String(v);
        return s.includes(',') || s.includes('"') ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(','));
    }
    fs.writeFileSync(resolved, lines.join('\n'), 'utf8');
    process.stderr.write(`saved ${rows.length} records to ${resolved}\n`);
  } else {
    fs.writeFileSync(resolved, JSON.stringify(data, null, 2), 'utf8');
    process.stderr.write(`saved to ${resolved}\n`);
  }
  printJson({ saved: resolved, count: Array.isArray(data) ? data.length : 1 });
}

function toCsvRows(items, columns) {
  const header = columns.join(',');
  const rows = items.map(item => {
    return columns.map(c => {
      const v = item[c];
      if (v === null || v === undefined) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',');
  });
  return { header, rows };
}

function extractEmailsFromText(text) {
  const regex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(regex);
  if (!matches) return [];
  return [...new Set(matches.map(m => m.toLowerCase()))].sort();
}

function extractPhonesFromText(text) {
  const regex = /(?:(?:\+|00)33|0)[1-9](?:[\s.-]?\d{2}){4}/g;
  const matches = text.match(regex);
  if (!matches) return [];
  return [...new Set(matches.map(m => m.trim()))].sort();
}

function showHelp() {
  console.log(`
AgentBridge CLI v${VERSION}

Usage: agentbridge <command> [args]

LEAD GENERATION:
  scrape-emails <query>    Full pipeline: search → visit pages → extract emails → CSV
    --limit=N              Max results to visit (default: 20)
    --out=file.csv         Save results as CSV
    --engine=google|bing   Search engine (default: google)
    --fast                 Scrape mode (minimal delays)
    --pages=N              Search result pages (default: 2)

  extract-emails <url>     Navigate to URL and extract all emails from the page
    --out=file.json        Save results

  extract-phones <url>     Navigate to URL and extract all phone numbers
    --out=file.json        Save results

BROWSER CONTROL:
  navigate <url>           Go to URL
  annotate                 Screenshot + element list
  click <ref>              Click element by ref number
  type <ref> <text>        Type text into element
  press <key>              Press Enter, Tab, Escape
  scroll [dir] [amount]    Scroll down/up (default: down 300)
  discover [steps] [px]    Slowly scroll and capture page states
  screenshot [--full-page] Capture and save a screenshot
  back / forward           Browser history with human pause
  summary                  Page summary (URL, title, elements)

EXTRACTION:
  extract [type]           Extract structured data (article|table|form|listings|marketplace)
    --limit=N              Max items (default: 20)
    --format=json|csv      Output format
    --out=file.csv         Save to file

  scrape [opts]            Extract marketplace results
    --limit=N --format=json|csv --out=file

  visibleText [opts]       Extract visible DOM text
    --limit=N              Max items
    --filter=TEXT          Filter by text (pipe-separated)
    --emails               Only show email addresses found in text
    --phones               Only show phone numbers found in text

SEARCH:
  webSearch <query>        Search the web and auto-paginate results
    --limit=N              Max results (default: 10)
    --engine=google|bing   Search engine
    --pages=N              Number of result pages
    --out=file.json        Save results
    --organic              Organic results only

  siteSearch <query>       Use the current site's visible search form

HUMAN BEHAVIOR:
  scan [opts]              Read visible text, scroll, and repeat
  findText <text>          Find visible text, scrolling if needed
  clickText <text>         Click visible text, scrolling if needed
  idle [ms]                Move around and pause like a reader
  jitter [radius] [n]      Small cursor hesitation movements
  skim [steps] [px]        Scroll/read with pauses
  backtrack                Small upward scroll and pause
  focusCycle [n]           Press Tab through focusable controls
  timing get/set/reset     Consultation timing profile
  antispam                 Check current page anti-spam state
  wait [ms]                Wait milliseconds (default: 2000)

BATCH & AUTOMATION:
  run <cmd1> <args1> ...   Run multiple commands in sequence (preserves browser state)
  batch <recipe.json>      Run multiple commands from a JSON recipe file
  repl                     Interactive REPL mode (type "exit" to quit)
  start                    Start the bridge server
  version                  Print version number
  help                     Show this help

GLOBAL FLAGS (set before command):
  --fast                   Scrape mode (BRIDGE_SCRAPE_SPEED=fast, minimal delays)
  --json-lines             Output JSON Lines (one object per line)

ENVIRONMENT:
  BRIDGE_URL               WebSocket URL (default: ws://localhost:8080/ws/browser-bridge)
  BRIDGE_SCRAPE_SPEED=fast  Fast mode (minimal human delays)
  BRIDGE_HEADLESS=false     Show the browser window

EXAMPLES:
  agentbridge scrape-emails "formateur IA France" --limit=50 --out=leads.csv --fast
  agentbridge extract-emails https://example.com/contact
  agentbridge navigate https://example.com
  agentbridge annotate
  agentbridge webSearch "AI consultants France" --limit=20 --out=results.json
  agentbridge run "navigate https://google.com" "annotate" "click 3" "summary"
  agentbridge repl
`);
}

const commands = {
  async navigate(ws, args) {
    const { opts, positional } = parseOpts(args);
    const url = positional[0];
    if (!url) throw new Error('Usage: navigate <url>');
    const r = await send(ws, { id: 'nav', type: 'navigate', payload: { url } });
    printJson(r);
  },

  async annotate(ws, args) {
    const r = await send(ws, { id: 'ann', type: 'page.annotate', payload: {} });
    printJson(r);
  },

  async click(ws, args) {
    const ref = parseInt(args[0]);
    if (isNaN(ref)) throw new Error('Usage: click <ref-number>');
    const r = await send(ws, { id: 'clk', type: 'agent.click', payload: { ref } });
    printJson(r);
  },

  async type(ws, args) {
    const ref = parseInt(args[0]);
    const text = args.slice(1).join(' ');
    if (isNaN(ref) || !text) throw new Error('Usage: type <ref-number> <text>');
    const r = await send(ws, { id: 'typ', type: 'agent.type', payload: { ref, text, clear: true } });
    printJson(r);
  },

  async press(ws, args) {
    const key = args[0];
    if (!key) throw new Error('Usage: press <Enter|Tab|Escape>');
    const r = await send(ws, { id: 'prs', type: 'agent.press', payload: { key } });
    printJson(r);
  },

  async scroll(ws, args) {
    const direction = args[0] || 'down';
    const amount = parseInt(args[1]) || 300;
    const r = await send(ws, { id: 'scr', type: 'agent.scroll', payload: { direction, amount } });
    printJson(r);
  },

  async discover(ws, args) {
    const steps = parseInt(args[0]) || 5;
    const amount = parseInt(args[1]) || 650;
    const r = await send(ws, { id: 'dsc', type: 'agent.discoverScroll', payload: { steps, amount } });
    printJson(r);
  },

  async screenshot(ws, args) {
    const { opts } = parseOpts(args);
    const r = await send(ws, { id: 'shot', type: 'vision.screenshot', payload: { fullPage: opts.fullPage } });
    printJson(r);
  },

  async extract(ws, args) {
    const { opts, positional } = parseOpts(args);
    const type = positional[0] || 'article';
    const r = await send(ws, { id: 'ext', type: 'dom.extract', payload: { type, limit: opts.limit, format: opts.format } });
    if (r && r.listings) {
      if (opts.csv || opts.format === 'csv') {
        const columns = ['name', 'price', 'location', 'summary', 'phone', 'website'];
        const csv = toCsvRows(r.listings.map(l => ({
          name: l.name || l.title || '',
          price: l.price || '',
          location: l.address || l.location || '',
          summary: l.summary || '',
          phone: l.phone || '',
          website: l.website || l.url || '',
        })), columns);
        writeOut({ header: csv.header, rows: csv.rows, count: r.listings.length }, opts, 'csv');
        return;
      }
    }
    writeOut(r, opts);
  },

  async scrape(ws, args) {
    const { opts } = parseOpts(args);
    const r = await send(ws, { id: 'scrape', type: 'scrape.results', payload: { type: 'marketplace', limit: opts.limit, format: opts.format } });
    writeOut(r, opts);
  },

  async webSearch(ws, args) {
    const { opts, positional } = parseOpts(args);
    const query = positional.join(' ');
    if (!query) throw new Error('Usage: webSearch <query> [--limit=N] [--engine=google] [--pages=N]');
    const r = await send(ws, {
      id: 'web-search',
      type: 'web.search',
      payload: { query, limit: opts.limit || 10, engine: opts.engine, pages: opts.pages || 2, useForm: !opts.direct, organicOnly: opts.organic },
    });
    if (r && r.results) {
      const results = r.results.map(res => ({
        title: res.title || '',
        url: res.url || '',
        snippet: (res.snippet || '').slice(0, 200),
        kind: res.kind || 'organic',
        emails: extractEmailsFromText(res.snippet || '').join('; '),
        phones: extractPhonesFromText(res.snippet || '').join('; '),
      }));
      const output = { count: results.length, results, query, engine: opts.engine || 'google' };
      writeOut(output, opts);
      process.stderr.write(`found ${results.length} results, ${results.filter(r => r.emails).length} with emails\n`);
    } else {
      writeOut(r, opts);
    }
  },

  async siteSearch(ws, args) {
    const { opts, positional } = parseOpts(args);
    const query = positional.join(' ');
    if (!query) throw new Error('Usage: siteSearch <query> [--field=Recherche]');
    const r = await send(ws, { id: 'site-search', type: 'form.search', payload: { query, field: opts.field } });
    printJson(r);
  },

  async visibleText(ws, args) {
    const { opts, positional } = parseOpts(args);
    const payload = {};
    if (opts.filter) payload.textFilter = opts.filter;
    if (opts.query) payload.query = opts.query;
    if (opts.limit) payload.limit = opts.limit;
    const r = await send(ws, { id: 'txt', type: 'dom.visibleText', payload });
    if (r && r.items) {
      const allText = r.items.map(i => i.text).join('\n');
      if (opts.emails) {
        const emails = extractEmailsFromText(allText);
        printJson({ count: emails.length, emails });
        return;
      }
      if (opts.phones) {
        const phones = extractPhonesFromText(allText);
        printJson({ count: phones.length, phones });
        return;
      }
    }
    printJson(r);
  },

  async scan(ws, args) {
    const { opts } = parseOpts(args);
    const payload = {};
    if (opts.steps) payload.steps = opts.steps;
    if (opts.amount) payload.amount = opts.amount;
    if (opts.filter) payload.textFilter = opts.filter;
    const r = await send(ws, { id: 'scn', type: 'human.scan', payload });
    printJson(r);
  },

  async findText(ws, args) {
    const text = args.join(' ');
    if (!text) throw new Error('Usage: findText <visible text>');
    const r = await send(ws, { id: 'fnd', type: 'human.findText', payload: { text } });
    printJson(r);
  },

  async clickText(ws, args) {
    const text = args.join(' ');
    if (!text) throw new Error('Usage: clickText <visible text>');
    const r = await send(ws, { id: 'ctx', type: 'human.clickText', payload: { text } });
    printJson(r);
  },

  async idle(ws, args) {
    const r = await send(ws, { id: 'idl', type: 'human.idle', payload: { durationMs: Number(args[0]) || undefined } });
    printJson(r);
  },

  async jitter(ws, args) {
    const r = await send(ws, { id: 'jit', type: 'human.jitter', payload: { radius: Number(args[0]) || undefined, moves: Number(args[1]) || undefined } });
    printJson(r);
  },

  async skim(ws, args) {
    const r = await send(ws, { id: 'skm', type: 'human.skim', payload: { steps: Number(args[0]) || undefined, amount: Number(args[1]) || undefined } });
    printJson(r);
  },

  async backtrack(ws) {
    const r = await send(ws, { id: 'bkt', type: 'human.backtrack', payload: {} });
    printJson(r);
  },

  async focusCycle(ws, args) {
    const r = await send(ws, { id: 'fcy', type: 'human.focusCycle', payload: { times: Number(args[0]) || undefined } });
    printJson(r);
  },

  async back(ws) {
    const r = await send(ws, { id: 'bak', type: 'human.goBack', payload: {} });
    printJson(r);
  },

  async forward(ws) {
    const r = await send(ws, { id: 'fwd', type: 'human.goForward', payload: {} });
    printJson(r);
  },

  async timing(ws, args) {
    const action = args[0] || 'get';
    if (action === 'get') {
      const r = await send(ws, { id: 'tmg', type: 'human.timing.get', payload: {} });
      printJson(r); return;
    }
    if (action === 'reset') {
      const r = await send(ws, { id: 'tmr', type: 'human.timing.reset', payload: {} });
      printJson(r); return;
    }
    if (action !== 'set') throw new Error('Usage: timing get|reset|set key=value ...');
    const payload = {};
    for (const arg of args.slice(1)) {
      const idx = arg.indexOf('=');
      if (idx <= 0) continue;
      payload[arg.slice(0, idx)] = Number(arg.slice(idx + 1));
    }
    const r = await send(ws, { id: 'tms', type: 'human.timing.set', payload });
    printJson(r);
  },

  async antispam(ws) {
    const r = await send(ws, { id: 'asp', type: 'human.antispam.check', payload: {} });
    printJson(r);
  },

  async summary(ws) {
    const r = await send(ws, { id: 'sum', type: 'agent.summary', payload: {} });
    printJson(r);
  },

  async wait(ws, args) {
    const ms = parseInt(args[0]) || 2000;
    await new Promise(r => setTimeout(r, ms));
    printJson({ waited: ms });
  },

  async version() {
    console.log(VERSION);
  },

  async extractEmails(ws, args) {
    const { opts, positional } = parseOpts(args);
    const url = positional[0];
    if (url) {
      await commands.navigate(ws, [url]);
    }
    const r = await send(ws, { id: 'ext-emails', type: 'dom.extractEmails', payload: {} });
    writeOut(r, opts);
    if (r && r.emails) {
      process.stderr.write(`found ${r.emails.length} email(s)\n`);
    }
  },

  async extractPhones(ws, args) {
    const { opts, positional } = parseOpts(args);
    const url = positional[0];
    if (url) {
      await commands.navigate(ws, [url]);
    }
    const r = await send(ws, { id: 'ext-phones', type: 'dom.extractPhones', payload: {} });
    writeOut(r, opts);
    if (r && r.phones) {
      process.stderr.write(`found ${r.phones.length} phone number(s)\n`);
    }
  },

  async scrapeEmails(ws, args) {
    const { opts, positional } = parseOpts(args);
    const query = positional.join(' ');
    if (!query) throw new Error('Usage: scrape-emails <query> [--limit=N] [--engine=google] [--out=file.csv]');

    process.stderr.write(`Searching for: "${query}" (${opts.engine || 'google'})\n`);

    const searchResult = await send(ws, {
      id: 'web-search',
      type: 'web.search',
      payload: { query, limit: opts.limit || 20, engine: opts.engine, pages: opts.pages || 2, organicOnly: true },
    });

    const urls = (searchResult?.results || []).map(r => r.url).filter(Boolean);
    process.stderr.write(`Found ${urls.length} URLs to visit\n`);

    const leads = [];
    let currentIdx = 0;

    for (const url of urls) {
      currentIdx++;
      process.stderr.write(`[${currentIdx}/${urls.length}] Visiting ${url}\n`);
      try {
        await send(ws, { id: 'nav', type: 'navigate', payload: { url } });
        const emailResult = await send(ws, { id: 'ext-emails', type: 'dom.extractEmails', payload: {} });
        const phoneResult = await send(ws, { id: 'ext-phones', type: 'dom.extractPhones', payload: {} });
        const pageInfo = await send(ws, { id: 'sum', type: 'agent.summary', payload: {} });
        const emails = (emailResult?.emails || []).filter(e => !e.includes('example.com'));
        const phones = (phoneResult?.phones || []);
        const entry = { source: url, title: pageInfo?.title || '', emails: emails.join(', '), phones: phones.join(', ') };
        leads.push(entry);
        if (emails.length > 0) {
          process.stderr.write(`  ✓ ${emails.length} email(s), ${phones.length} phone(s)\n`);
        } else {
          process.stderr.write(`  - no emails found\n`);
        }
      } catch (e) {
        process.stderr.write(`  ✗ ${e.message}\n`);
      }
    }

    const allEmails = [...new Set(leads.flatMap(l => l.emails ? l.emails.split(', ').filter(Boolean) : []))];
    const allPhones = [...new Set(leads.flatMap(l => l.phones ? l.phones.split(', ').filter(Boolean) : []))];

    const result = {
      query,
      visited: urls.length,
      totalEmails: allEmails.length,
      totalPhones: allPhones.length,
      leads: leads.filter(l => l.emails || l.phones),
      emails: allEmails,
    };

    process.stderr.write(`\n=== SUMMARY ===\n`);
    process.stderr.write(`URLs visited: ${urls.length}\n`);
    process.stderr.write(`Emails found: ${allEmails.length}\n`);
    process.stderr.write(`Phones found: ${allPhones.length}\n`);
    process.stderr.write(`Pages with contacts: ${leads.filter(l => l.emails || l.phones).length}/${urls.length}\n`);

    if (opts.out) {
      const resolved = path.resolve(opts.out);
      if (opts.format === 'csv' || opts.out.endsWith('.csv')) {
        const csvLines = [`source,title,emails,phones`];
        for (const l of leads) {
          const esc = (s) => (s || '').includes(',') ? `"${(s || '').replace(/"/g, '""')}"` : (s || '');
          csvLines.push(`${esc(l.source)},${esc(l.title)},${esc(l.emails)},${esc(l.phones)}`);
        }
        fs.writeFileSync(resolved, csvLines.join('\n'), 'utf8');
        process.stderr.write(`Saved CSV: ${resolved}\n`);
      } else {
        fs.writeFileSync(resolved, JSON.stringify(result, null, 2), 'utf8');
        process.stderr.write(`Saved JSON: ${resolved}\n`);
      }
    }

    printJson(result);
  },

  async repl(ws) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'bridge> ' });
    process.stderr.write('AgentBridge REPL. Type "help" for commands, "exit" to quit.\n\n');
    rl.prompt();
    for await (const line of rl) {
      if (!line.trim()) { rl.prompt(); continue; }
      const parsed = parseArgs(line.trim());
      const cmd = parsed[0];
      const cargs = parsed.slice(1);
      if (cmd === 'exit' || cmd === 'quit') break;
      if (cmd === 'help') { showHelp(); rl.prompt(); continue; }
      const resolved = kebabToCamel(cmd) || cmd;
      const fn = commands[resolved];
      if (!fn) { process.stderr.write(`Unknown command: ${cmd}\n`); rl.prompt(); continue; }
      try { await fn(ws, cargs); } catch (e) { process.stderr.write(e.message + '\n'); }
      rl.prompt();
    }
    rl.close();
  },

  async run(ws, args) {
    const line = args.join(' ');
    const tokens = parseArgs(`__dummy__ ${line}`);
    tokens.shift();
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
      if (!fn || ['repl', 'version', 'batch', 'start', 'scrapeEmails', 'run'].includes(resolved)) continue;
      process.stderr.write(`>>> ${step.cmd} ${step.args.join(' ')}\n`);
      await fn(ws, step.args);
    }
  },

  async start() {
    process.stderr.write('Starting AgentBridge server...\n');
    const child = spawn(process.execPath, [require.resolve('./bridge-cli.cjs'), 'navigate', 'about:blank'], {
      env: { ...process.env },
      stdio: 'inherit',
    });
    child.on('error', (e) => process.stderr.write('Failed: ' + e.message + '\n'));
  },

  async batch(ws, args) {
    const file = args[0];
    if (!file) throw new Error('Usage: batch <recipe.json>');
    const recipe = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const step of recipe.steps) {
      process.stderr.write(`>>> ${step.cmd} ${(step.args || []).join(' ')}\n`);
      const fn = commands[step.cmd];
      if (!fn) throw new Error(`Unknown: ${step.cmd}`);
      await fn(ws, step.args || []);
    }
  }
};

function kebabToCamel(cmd) {
  const map = {
    'visible-text': 'visibleText', 'find-text': 'findText', 'click-text': 'clickText',
    'focus-cycle': 'focusCycle', 'web-search': 'webSearch', 'site-search': 'siteSearch',
    'extract-emails': 'extractEmails', 'extract-phones': 'extractPhones',
    'scrape-emails': 'scrapeEmails', 'json-lines': 'jsonLines',
  };
  return map[cmd] || null;
}

async function main() {
  const args = process.argv.slice(2);

  // Global flags
  if (args.includes('--fast')) {
    process.env.BRIDGE_SCRAPE_SPEED = 'fast';
    process.env.BRIDGE_POLITE_MODE = '0';
  }
  if (args.includes('--json-lines')) {
    process.env.BRIDGE_JSON_LINES = '1';
  }

  // Version/help
  if (args.includes('--version') || args.includes('-v')) { console.log(VERSION); process.exit(0); }
  if (args.includes('--help') || args.includes('-h')) { showHelp(); process.exit(0); }

  const cleanArgs = args.filter(a => !['--fast', '--json-lines'].includes(a));
  const [cmd, ...cmdArgs] = cleanArgs;
  if (!cmd || cmd === 'help') { showHelp(); process.exit(0); }

  const resolved = kebabToCamel(cmd) || cmd;
  const fn = commands[resolved];
  if (!fn) {
    process.stderr.write(`Unknown command: ${cmd}. Run 'agentbridge help' for usage.\n`);
    process.exit(1);
  }

  if (resolved === 'version') { fn(); process.exit(0); }

  const needsServer = !['start'].includes(resolved);
  const ws = needsServer ? await connectOrStart() : null;
  try {
    if (resolved === 'start') { fn(); return; }
    await fn(ws, cmdArgs);
  } finally {
    if (ws) ws.close();
  }
}

main().catch(e => { process.stderr.write(e.message + '\n'); process.exit(1); });
