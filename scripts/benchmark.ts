import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildHandlers } from '../src/browser/handlers/index.js';
import { controller, sessionStore } from '../src/browser/controller.js';
import { VERSION } from '../src/version.js';

const TASKS = Array.from({ length: 20 }, (_, i) => {
  const n = i + 1;
  return {
    id: `task-${String(n).padStart(2, '0')}`,
    path: `/task-${n}`,
    label: `Action ${n}`,
    html: `<!doctype html><html><body>
      <main>
        <h1>Benchmark ${n}</h1>
        <button id="target" onclick="window.__ok=true">Action ${n}</button>
        <input aria-label="Field ${n}" />
      </main>
    </body></html>`,
  };
});

function estimateTokens(value: unknown) {
  return Math.ceil(JSON.stringify(value).length / 4);
}

async function withServer<T>(fn: (baseUrl: string) => Promise<T>) {
  const server = createServer((req, res) => {
    const task = TASKS.find((t) => t.path === req.url);
    if (!task) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(task.html);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('failed to bind benchmark server');
  try {
    return await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

await controller.launch({ headless: true, channel: 'chromium', maximized: false });
const handlers: Record<string, any> = {};
const dispatch = async (type: string, payload: any = {}) => sessionStore.run(payload.sessionId, () => handlers[type](payload));
Object.assign(handlers, buildHandlers(() => {}, dispatch));

const report = await withServer(async (baseUrl) => {
  const results = [];
  for (const task of TASKS) {
    const started = Date.now();
    let ok = false;
    let annotateTokens = 0;
    let error = '';
    try {
      await dispatch('navigate', { url: `${baseUrl}${task.path}` });
      const ann = await dispatch('page.annotate', { noImage: true });
      annotateTokens = estimateTokens({ elements: ann.elements, url: ann.url, title: ann.title });
      const target = ann.elements.find((el: any) => el.name === task.label)?.id;
      if (!target) throw new Error(`missing target ref for ${task.label}`);
      await dispatch('agent.click', { ref: target, retry: false });
      ok = await (await controller.page()).evaluate(() => Boolean((window as any).__ok));
    } catch (e: any) {
      error = e.message;
    }
    results.push({
      id: task.id,
      ok,
      durationMs: Date.now() - started,
      tokens: annotateTokens,
      error: error || undefined,
    });
  }
  const successes = results.filter((r) => r.ok).length;
  const avgDurationMs = Math.round(results.reduce((s, r) => s + r.durationMs, 0) / results.length);
  const avgTokens = Math.round(results.reduce((s, r) => s + r.tokens, 0) / results.length);
  return {
    version: VERSION,
    tasks: results.length,
    successes,
    successRate: successes / results.length,
    avgDurationMs,
    avgTokens,
    results,
  };
});

await controller.close();
const outDir = join(process.cwd(), 'logs', 'benchmarks');
await mkdir(outDir, { recursive: true });
const outPath = join(outDir, `benchmark-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
await writeFile(outPath, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ ...report, outPath }, null, 2));
