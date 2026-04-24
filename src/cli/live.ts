#!/usr/bin/env node
import WebSocket from 'ws';

const URL = process.env.BRIDGE_URL ?? 'ws://localhost:8080/ws/browser-bridge';

const ALIAS: Record<string, { type: string; build: (args: string[]) => any }> = {
  goto: { type: 'navigate', build: ([url]) => ({ url }) },
  navigate: { type: 'navigate', build: ([url]) => ({ url }) },
  search: { type: 'search', build: ([query, engine = 'google']) => ({ query, engine }) },
  click: { type: 'dom.click', build: ([query]) => ({ query }) },
  hover: { type: 'dom.hover', build: ([query]) => ({ query }) },
  type: { type: 'dom.type', build: ([query, ...rest]) => ({ query, value: rest.join(' ') }) },
  press: { type: 'dom.press', build: ([key]) => ({ key }) },
  extract: { type: 'dom.extract', build: () => ({}) },
  html: { type: 'dom.html', build: () => ({}) },
  find: { type: 'dom.search', build: ([text]) => ({ text }) },
  scroll: { type: 'dom.scrollDown', build: ([n]) => ({ amount: Number(n) || 500 }) },
  up: { type: 'dom.scrollUp', build: ([n]) => ({ amount: Number(n) || 500 }) },
  screenshot: { type: 'screenshot', build: () => ({}) },
  shot: { type: 'screenshot', build: () => ({}) },
  read: { type: 'human.read', build: ([ms]) => ({ durationMs: Number(ms) || 4000 }) },
  tabs: { type: 'tab.list', build: () => ({}) },
  vision: { type: 'vision.start', build: ([fps]) => ({ fps: Number(fps) || 2 }) },
  stop: { type: 'vision.stop', build: () => ({}) },
  close: { type: 'browser.close', build: () => ({}) },
  ping: { type: 'ping', build: () => ({}) },
};

function parseCommand(argv: string[]): { type: string; payload: any } {
  if (argv.length === 0) {
    console.error('usage: live <command> [args]  |  live <type> <json-payload>');
    console.error('commands:', Object.keys(ALIAS).join(', '));
    process.exit(1);
  }
  const [cmd, ...rest] = argv;
  const alias = ALIAS[cmd];
  if (alias) return { type: alias.type, payload: alias.build(rest) };
  const raw = rest.join(' ').trim();
  if (raw.startsWith('{')) {
    try {
      return { type: cmd, payload: JSON.parse(raw) };
    } catch {
      /* fallthrough */
    }
  }
  return { type: cmd, payload: {} };
}

const { type, payload } = parseCommand(process.argv.slice(2));
const id = Math.random().toString(36).slice(2);

const ws = new WebSocket(URL);
ws.on('open', () => ws.send(JSON.stringify({ id, type, payload })));
ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.type === 'hello') return;
  if (msg.id !== id) return;
  if (msg.ok) {
    console.log(JSON.stringify(msg.result, null, 2));
    ws.close();
    process.exit(0);
  } else {
    console.error('ERROR:', msg.error);
    ws.close();
    process.exit(2);
  }
});
ws.on('error', (err) => {
  console.error('connection error:', err.message);
  process.exit(1);
});
setTimeout(() => {
  console.error('timeout');
  process.exit(3);
}, 60000);
