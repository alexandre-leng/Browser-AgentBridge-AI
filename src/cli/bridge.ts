#!/usr/bin/env node
import { WebSocket } from 'ws';
import readline from 'node:readline';

const WS_URL = process.env.BRIDGE_URL || 'ws://localhost:8080/ws/browser-bridge';

export function parseArgs(input: string): string[] {
  const args: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (escaped) { current += c; escaped = false; continue; }
    if (c === '\\') { escaped = true; continue; }
    if (quote) {
      if (c === quote) { quote = null; continue; }
      current += c;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === ' ' || c === '\t') {
      if (current) { args.push(current); current = ''; }
      continue;
    }
    current += c;
  }
  if (quote) throw new Error(`unterminated ${quote} quote`);
  if (escaped) throw new Error('trailing backslash');
  if (current) args.push(current);
  return args;
}

function mapCommand(type: string, pParts: string[]): any {
  switch (type) {
    case 'navigate': return { type: 'navigate', payload: { url: pParts[0], autoAnnotate: pParts.includes('--annotate') } };
    case 'task': return { type: 'agent.task', payload: { goal: pParts.join(' ') } };
    case 'search': return { type: 'agent.search', payload: { query: pParts.join(' ') } };
    case 'hover':
      if (!isNaN(Number(pParts[0]))) return { type: 'agent.hover', payload: { ref: Number(pParts[0]) } };
      return { type: 'agent.hover', payload: { ref: pParts.join(' ') } };
    case 'click':
      if (!isNaN(Number(pParts[0]))) return { type: 'agent.click', payload: { ref: Number(pParts[0]) } };
      return { type: 'dom.click', payload: { query: pParts.join(' ') } };
    case 'type':
      if (!isNaN(Number(pParts[0]))) return { type: 'agent.type', payload: { ref: Number(pParts[0]), text: pParts.slice(1).join(' ') } };
      return { type: 'dom.type', payload: { query: pParts[0], text: pParts.slice(1).join(' ') } };
    case 'press': return { type: 'agent.press', payload: { key: pParts[0] } };
    case 'wait':
      if (pParts[0] === '--for') {
        if (pParts[1] === 'text') return { type: 'agent.waitFor', payload: { text: pParts.slice(2).join(' ') } };
        if (pParts[1] === 'url') return { type: 'agent.waitFor', payload: { url: pParts.slice(2).join(' ') } };
      }
      return { type: 'wait', payload: { ms: Number(pParts[0]) || 1000 } };
    case 'annotate': return { type: 'page.annotate', payload: { noImage: pParts.includes('--no-image') } };
    case 'extract': return { type: 'dom.extract', payload: { type: pParts[0]?.startsWith('--type') ? pParts[0].split('=')[1] : pParts[1] } };
    case 'visible-text': return { type: 'dom.visibleText', payload: {
      textFilter: pParts.find(p => p.startsWith('--filter='))?.split('=').slice(1).join('='),
      query: pParts.find(p => p.startsWith('--query='))?.split('=').slice(1).join('='),
      limit: Number(pParts.find(p => p.startsWith('--limit='))?.split('=')[1]) || undefined,
    } };
    case 'status': return { type: 'browser.status', payload: {} };
    case 'screenshot': return { type: 'vision.screenshot', payload: { fullPage: pParts.includes('--full-page') } };
    case 'scroll': return { type: 'agent.scroll', payload: { direction: Number(pParts[0]) < 0 ? 'up' : 'down', amount: Math.abs(Number(pParts[0]) || 600) } };
    case 'discover': return { type: 'agent.discoverScroll', payload: { steps: Number(pParts[0]) || 5, amount: Number(pParts[1]) || 650 } };
    case 'scan': return { type: 'human.scan', payload: {
      steps: Number(pParts.find(p => p.startsWith('--steps='))?.split('=')[1]) || Number(pParts[0]) || 4,
      amount: Number(pParts.find(p => p.startsWith('--amount='))?.split('=')[1]) || undefined,
      textFilter: pParts.find(p => p.startsWith('--filter='))?.split('=').slice(1).join('='),
    } };
    case 'idle': return { type: 'human.idle', payload: { durationMs: Number(pParts[0]) || undefined } };
    case 'jitter': return { type: 'human.jitter', payload: { radius: Number(pParts[0]) || undefined, moves: Number(pParts[1]) || undefined } };
    case 'skim': return { type: 'human.skim', payload: { steps: Number(pParts[0]) || undefined, amount: Number(pParts[1]) || undefined } };
    case 'backtrack': return { type: 'human.backtrack', payload: {} };
    case 'focus-cycle': return { type: 'human.focusCycle', payload: { times: Number(pParts[0]) || undefined } };
    case 'back': return { type: 'human.goBack', payload: {} };
    case 'forward': return { type: 'human.goForward', payload: {} };
    case 'find-text': return { type: 'human.findText', payload: { text: pParts.join(' ') } };
    case 'click-text': return { type: 'human.clickText', payload: { text: pParts.join(' ') } };
    case 'timing': {
      const action = pParts[0] ?? 'get';
      if (action === 'get') return { type: 'human.timing.get', payload: {} };
      if (action === 'reset') return { type: 'human.timing.reset', payload: {} };
      if (action === 'set') {
        const payload = Object.fromEntries(
          pParts.slice(1)
            .filter(p => p.includes('='))
            .map(p => {
              const [key, ...rest] = p.split('=');
              return [key, Number(rest.join('='))];
            }),
        );
        return { type: 'human.timing.set', payload };
      }
      return null;
    }
    case 'antispam': return { type: 'human.antispam.check', payload: {} };
    case 'summary': return { type: 'agent.summary', payload: {} };
    case 'run':
      return {
        type: 'script.execute',
        payload: {
          commands: pParts.map(s => {
            const inner = parseArgs(s);
            return mapCommand(inner[0], inner.slice(1));
          }).filter(Boolean),
          returnAllResults: true
        }
      };
    default: return null;
  }
}

async function startRepl() {
  const ws = new WebSocket(WS_URL);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'bridge> ' });

  ws.on('open', () => {
    console.log('--- Bridge REPL (type "exit" to quit) ---');
    rl.prompt();
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'vision.frame' || msg.type === 'hello') return;
    if (msg.error) console.log('Error:', msg.error);
    else console.log(JSON.stringify(msg.result || msg, null, 2));
    rl.prompt();
  });

  ws.on('error', (err) => { console.log('Connection error:', err.message); process.exit(1); });

  rl.on('line', (line) => {
    const cmd = line.trim();
    if (!cmd) { rl.prompt(); return; }
    if (cmd === 'exit' || cmd === 'quit') { ws.close(); rl.close(); return; }
    const parts = parseArgs(cmd);
    const command = mapCommand(parts[0], parts.slice(1));
    if (command) ws.send(JSON.stringify({ id: Math.random().toString(36).slice(2), ...command }));
    else { console.log('Unknown command'); rl.prompt(); }
  });
}

async function main() {
  const args = process.argv.slice(2);
  const flags = { 
    quiet: args.includes('--quiet'),
    help: args.includes('--help')
  };
  const filteredArgs = args.filter(a => a !== '--quiet' && a !== '--help');
  
  if (filteredArgs[0] === 'repl') {
    return startRepl();
  }

  const ws = new WebSocket(WS_URL);
  const type = filteredArgs[0];
  const payloadParts = filteredArgs.slice(1);
  const command = mapCommand(type, payloadParts);

  if (!command) {
    console.error(JSON.stringify({ ok: false, error: `Unknown command: ${type}` }));
    process.exit(1);
  }

  ws.on('open', () => {
    ws.send(JSON.stringify({ id: 'cli', ...command }));
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'vision.frame' || msg.type === 'hello') return;
    if (msg.type === 'human.feedback') {
      console.error(JSON.stringify(msg.payload, null, flags.quiet ? 0 : 2));
      return;
    }
    
    if (msg.ok) {
      const res = msg.result;
      const out: any = { ok: true };
      
      if (command.type === 'script.execute') {
        out.results = res.allResults?.map((r: any) => {
          const entry: any = { step: r.step, type: r.type, ok: !r.error };
          if (r.error) entry.error = r.error;
          if (r.result) {
            if (r.type === 'page.annotate') entry.elements = r.result.elements?.length;
            if (r.type === 'agent.click') entry.clicked = r.result.clicked;
            if (r.type === 'navigate') entry.title = r.result.title;
            if (r.type === 'agent.summary') entry.summary = r.result.summary;
            if (r.type === 'dom.extract') entry.data = r.result;
            if (r.type === 'agent.press') entry.navigated = r.result.navigated;
          }
          return entry;
        });
        out.durationMs = res.durationMs;
      } else {
        Object.assign(out, res);
      }
      
      delete out.imageB64;
      delete out.image;
      console.log(JSON.stringify(out, null, flags.quiet ? 0 : 2));
      ws.close();
      process.exit(0);
    } else {
      console.error(JSON.stringify({ ok: false, error: msg.error }));
      ws.close();
      process.exit(2);
    }
  });

  ws.on('error', (err) => {
    console.error(JSON.stringify({ ok: false, error: err.message }));
    process.exit(1);
  });

  setTimeout(() => {
    console.error(JSON.stringify({ ok: false, error: 'timeout' }));
    process.exit(3);
  }, 30000);
}

import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';

const isMain = (() => {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1] ?? '');
  } catch {
    return false;
  }
})();
if (isMain) main();
