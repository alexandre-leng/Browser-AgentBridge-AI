#!/usr/bin/env node
import WebSocket from 'ws';

const URL = process.env.BRIDGE_URL ?? 'ws://localhost:8080/ws/browser-bridge';

const args = process.argv.slice(2);
const flags = { wait: 0, save: false, quiet: false };
const cmdArgs: string[] = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--wait') {
    flags.wait = Number(args[++i]) || 0;
  } else if (args[i] === '--save') {
    flags.save = true;
  } else if (args[i] === '--quiet') {
    flags.quiet = true;
  } else if (args[i] === '--json') {
    // default
  } else {
    cmdArgs.push(args[i]);
  }
}

if (cmdArgs.length === 0) {
  console.error('usage: bridge <command> [args...] [flags]');
  process.exit(1);
}

const cmd = cmdArgs[0];
const rest = cmdArgs.slice(1);

let type = '';
let payload: any = {};

switch (cmd) {
  case 'navigate':
    type = 'navigate';
    payload = { url: rest[0] };
    break;
  case 'annotate':
    type = 'page.annotate';
    payload = {};
    break;
  case 'snapshot':
    type = 'page.snapshot';
    payload = {};
    break;
  case 'click':
    type = 'agent.click';
    payload = { ref: Number(rest[0]) || rest[0] };
    break;
  case 'type':
    type = 'agent.type';
    payload = { ref: Number(rest[0]) || rest[0], text: rest.slice(1).join(' ') };
    break;
  case 'press':
    type = 'agent.press';
    payload = { key: rest[0] };
    break;
  case 'scroll':
    type = 'agent.scroll';
    payload = { amount: Number(rest[0]) || 500 };
    break;
  case 'screenshot':
    type = 'screenshot';
    payload = {};
    break;
  case 'extract':
    type = 'dom.extract';
    payload = {};
    break;
  case 'status':
    type = 'browser.status';
    payload = {};
    break;
  case 'run':
    type = 'script.execute';
    const commands = rest.map(rawCmd => {
      const parts = rawCmd.split(' ');
      const c = parts[0];
      const pParts = parts.slice(1);
      switch(c) {
        case 'navigate': return { type: 'navigate', payload: { url: pParts[0] } };
        case 'annotate': return { type: 'page.annotate', payload: {} };
        case 'click': return { type: 'agent.click', payload: { ref: Number(pParts[0]) || pParts[0] } };
        case 'type': return { type: 'agent.type', payload: { ref: Number(pParts[0]) || pParts[0], text: pParts.slice(1).join(' ') } };
        case 'press': return { type: 'agent.press', payload: { key: pParts[0] } };
        case 'wait': return { type: 'wait', payload: { ms: Number(pParts[0]) } };
        default: return { type: c, payload: {} };
      }
    });
    payload = { commands, returnAllResults: true };
    break;
  default:
    type = cmd;
    if (rest[0] && rest[0].startsWith('{')) {
      try { payload = JSON.parse(rest.join(' ')); } catch {}
    }
}

if (flags.wait > 0) {
  if (type === 'script.execute') {
    payload.commands.push({ type: 'wait', payload: { ms: flags.wait } });
  } else {
    payload = { commands: [{ type, payload }, { type: 'wait', payload: { ms: flags.wait } }], returnAllResults: false };
    type = 'script.execute';
  }
}

const id = Math.random().toString(36).slice(2);
const ws = new WebSocket(URL);
ws.on('open', () => ws.send(JSON.stringify({ id, type, payload })));
ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.type === 'hello') return;
  if (msg.id !== id) return;
  
  if (msg.ok) {
    let res = msg.result ?? {};
    const out: any = { ok: true };
    
    const targetType = type === 'script.execute' && !payload.returnAllResults ? payload.commands[0].type : type;
    const targetRes = type === 'script.execute' && !payload.returnAllResults ? res.finalResult : res;

    if (targetType === 'page.annotate') {
      out.elements = targetRes.elements?.length || 0;
      out.image = targetRes.imageUrl;
      out.url = targetRes.url;
      out.title = targetRes.title;
      if (targetRes.elements) {
        out.top = targetRes.elements.slice(0, 5).map((e: any) => ({ id: e.id, role: e.role, name: e.name }));
      }
    } else if (targetType === 'page.snapshot') {
      out.elements = targetRes.tree?.length || 0;
      out.url = targetRes.url;
      out.title = targetRes.title;
    } else if (targetType === 'agent.click') {
       out.clicked = targetRes.clicked;
       out.ref = targetRes.ref ?? payload.ref;
    } else if (targetType === 'agent.type') {
       out.typed = targetRes.typed;
       out.ref = targetRes.ref ?? payload.ref;
    } else if (targetType === 'agent.press') {
       out.key = targetRes.key;
       out.navigated = true; 
    } else if (type === 'script.execute' && payload.returnAllResults) {
       out.results = res.allResults?.map((r:any) => ({ step: r.step, type: r.type, ok: !r.error }));
       out.finalResult = res.finalResult?.imageUrl ? { image: res.finalResult.imageUrl } : res.finalResult;
       out.durationMs = res.durationMs;
    } else {
       Object.assign(out, targetRes);
    }

    if (out.imageB64) delete out.imageB64;
    
    if (flags.quiet) {
      console.log(JSON.stringify({ ok: true }));
    } else {
      console.log(JSON.stringify(out));
    }
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
}, 60000);
