#!/usr/bin/env node
import { WebSocket } from 'ws';
import readline from 'node:readline';
import { readFileSync, writeFileSync } from 'node:fs';
import { installTargets, parseInstallArgs } from './install.js';

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

function optValue(parts: string[], name: string) {
  const prefix = `${name}=`;
  const inline = parts.find(p => p.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const idx = parts.indexOf(name);
  return idx >= 0 ? parts[idx + 1] : undefined;
}

function csvTerms(value: string | undefined) {
  return value ? value.split(',').map(s => s.trim()).filter(Boolean) : undefined;
}

function optionParts(pParts: string[]) {
  const opt = (name: string) => optValue(pParts, name);
  return {
    limit: Number(opt('--limit')) || undefined,
    format: opt('--format'),
    engine: opt('--engine'),
    pages: Number(opt('--pages')) || undefined,
    out: opt('--out'),
    positional: pParts.filter((part, i) => {
      if (part.startsWith('--limit=') || part.startsWith('--format=') || part.startsWith('--out=')) return false;
      if (part.startsWith('--engine=') || part.startsWith('--pages=')) return false;
      if (['--limit', '--format', '--out', '--engine', '--pages'].includes(part)) return false;
      if (['--limit', '--format', '--out', '--engine', '--pages'].includes(pParts[i - 1])) return false;
      return true;
    }),
  };
}

export function mapCommand(type: string, pParts: string[]): any {
  switch (type) {
    case 'navigate': return { type: 'navigate', payload: { url: pParts[0], autoAnnotate: pParts.includes('--annotate'), timeout: Number(pParts.find(p => p.startsWith('--timeout='))?.split('=')?.[1]) || 30000 } };
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
    case 'extract': {
      const opts = optionParts(pParts);
      return {
        type: 'dom.extract',
        payload: {
          type: opts.positional[0]?.startsWith('--type') ? opts.positional[0].split('=')[1] : (opts.positional[0] || opts.positional[1]),
          limit: opts.limit,
          format: opts.format,
        },
      };
    }
    case 'scrape': {
      const opts = optionParts(pParts);
      return { type: 'scrape.results', payload: { type: 'marketplace', limit: opts.limit, format: opts.format } };
    }
    case 'web-search':
    case 'webSearch': {
      const opts = optionParts(pParts);
      return {
        type: 'web.search',
        payload: {
          query: opts.positional.filter(part => part !== '--direct' && part !== '--organic').join(' '),
          limit: opts.limit,
          engine: opts.engine,
          pages: opts.pages,
          useForm: !pParts.includes('--direct'),
          organicOnly: pParts.includes('--organic'),
        },
      };
    }
    case 'site-search':
    case 'siteSearch': {
      const field = optValue(pParts, '--field');
      const query = pParts.filter((part, i) => {
        if (part.startsWith('--field=')) return false;
        if (part === '--field') return false;
        if (pParts[i - 1] === '--field') return false;
        return true;
      }).join(' ');
      return { type: 'form.search', payload: { query, field } };
    }
    case 'visible-text': return { type: 'dom.visibleText', payload: {
      textFilter: optValue(pParts, '--filter'),
      filterAny: csvTerms(optValue(pParts, '--filter-any')),
      filterLines: pParts.includes('--filter-lines'),
      query: optValue(pParts, '--query'),
      limit: Number(optValue(pParts, '--limit')) || undefined,
    } };
    case 'status': return { type: 'browser.status', payload: {} };
    case 'screenshot': return { type: 'vision.screenshot', payload: { fullPage: pParts.includes('--full-page') } };
    case 'scroll': return { type: 'agent.scroll', payload: { direction: Number(pParts[0]) < 0 ? 'up' : 'down', amount: Math.abs(Number(pParts[0]) || 600) } };
    case 'discover': return { type: 'agent.discoverScroll', payload: { steps: Number(pParts[0]) || 5, amount: Number(pParts[1]) || 650 } };
    case 'scan': return { type: 'human.scan', payload: {
      steps: Number(optValue(pParts, '--steps')) || Number(pParts[0]) || 4,
      amount: Number(optValue(pParts, '--amount')) || undefined,
      textFilter: optValue(pParts, '--filter'),
      filterAny: csvTerms(optValue(pParts, '--filter-any')),
      filterLines: pParts.includes('--filter-lines'),
    } };
    case 'idle': return { type: 'human.idle', payload: { durationMs: Number(pParts[0]) || undefined } };
    case 'jitter': return { type: 'human.jitter', payload: { radius: Number(pParts[0]) || undefined, moves: Number(pParts[1]) || undefined } };
    case 'skim': return { type: 'human.skim', payload: { steps: Number(pParts[0]) || undefined, amount: Number(pParts[1]) || undefined } };
    case 'backtrack': return { type: 'human.backtrack', payload: {} };
    case 'focus-cycle': return { type: 'human.focusCycle', payload: { times: Number(pParts[0]) || undefined } };
    case 'back': return { type: 'human.goBack', payload: {} };
    case 'forward': return { type: 'human.goForward', payload: {} };
    case 'find-text': return { type: 'human.findText', payload: { text: pParts.join(' ') } };
    case 'click-text': {
      const timeoutMs = Number(optValue(pParts, '--timeout-ms')) || 15000;
      const maxScrolls = Number(optValue(pParts, '--max-scrolls'));
      const text = pParts.filter((p, i) => {
        if (p.startsWith('--timeout-ms=') || p.startsWith('--max-scrolls=')) return false;
        if ((pParts[i - 1] === '--timeout-ms') || (pParts[i - 1] === '--max-scrolls')) return false;
        return p !== '--timeout-ms' && p !== '--max-scrolls';
      }).join(' ');
      return { type: 'human.clickText', payload: { text, timeoutMs, maxScrolls: Number.isFinite(maxScrolls) ? maxScrolls : undefined } };
    }
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
    case 'script':
      return {
        type: 'script.execute',
        payload: {
          commands: loadScriptCommands(pParts[0]),
          returnAllResults: true
        }
      };
    default: return null;
  }
}

function commandFromScriptStep(step: any) {
  if (typeof step === 'string') {
    const parts = parseArgs(step);
    return mapCommand(parts[0], parts.slice(1));
  }
  if (!step || typeof step !== 'object') return null;
  if (typeof step.command === 'string') {
    const parts = parseArgs(step.command);
    return mapCommand(parts[0], parts.slice(1));
  }
  if (typeof step.type === 'string' && step.payload && typeof step.payload === 'object') {
    return { type: step.type, payload: step.payload };
  }

  const { type, ...rest } = step;
  if (typeof type !== 'string') return null;
  switch (type) {
    case 'navigate': return mapCommand('navigate', [String(rest.url ?? '')]);
    case 'annotate': return mapCommand('annotate', rest.noImage ? ['--no-image'] : []);
    case 'click': return mapCommand('click', [String(rest.ref ?? rest.query ?? '')]);
    case 'type': return mapCommand('type', [String(rest.ref ?? rest.query ?? ''), String(rest.text ?? '')]);
    case 'press': return mapCommand('press', [String(rest.key ?? '')]);
    case 'wait': return mapCommand('wait', [String(rest.ms ?? rest.durationMs ?? 1000)]);
    case 'scroll': return mapCommand('scroll', [String(rest.amount ?? 600)]);
    case 'extract': return mapCommand('extract', [String(rest.extractType ?? rest.kind ?? rest.value ?? 'article')]);
    case 'summary': return mapCommand('summary', []);
    default: return null;
  }
}

export function loadScriptCommands(filePath: string): any[] {
  if (!filePath) throw new Error('Usage: script <file.json>');
  const data = JSON.parse(readFileSync(filePath, 'utf8'));
  const steps = Array.isArray(data) ? data : data.steps;
  if (!Array.isArray(steps)) throw new Error('Script file must be an array or contain a steps array');
  const commands = steps.map(commandFromScriptStep).filter(Boolean);
  if (commands.length === 0) throw new Error('Script file did not contain any supported steps');
  return commands;
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

  if (filteredArgs[0] === 'start') {
    await import('../server.js');
    return;
  }

  if (filteredArgs[0] === 'install') {
    try {
      const { target, options } = parseInstallArgs(filteredArgs.slice(1));
      const results = installTargets(target, options);
      console.log(JSON.stringify({ ok: true, installed: results }, null, flags.quiet ? 0 : 2));
      return;
    } catch (err: any) {
      console.error(JSON.stringify({ ok: false, error: err?.message ?? String(err) }));
      process.exit(1);
    }
  }

  const ws = new WebSocket(WS_URL);
  const type = filteredArgs[0];
  const payloadParts = filteredArgs.slice(1);
  const command = mapCommand(type, payloadParts);
  const outputFile = optionParts(payloadParts).out;

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
      if (outputFile && (command.type === 'dom.extract' || command.type === 'scrape.results')) {
        const content = command.payload?.format === 'csv' && res.csv ? res.csv : JSON.stringify(res, null, 2);
        writeFileSync(outputFile, content, 'utf8');
        console.log(JSON.stringify({ ok: true, saved: outputFile, count: res.count ?? res.items?.length ?? 0 }, null, flags.quiet ? 0 : 2));
        ws.close();
        process.exit(0);
      }
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
