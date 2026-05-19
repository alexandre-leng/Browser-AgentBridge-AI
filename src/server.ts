// esbuild emits a `__name(fn, name)` helper to preserve class/function names when
// running through `tsx`. In some Node versions the helper isn't defined globally,
// causing `ReferenceError: __name is not defined` deep inside class definitions
// (manifests as `__name undefined` when callers like `agent.summary` run with
// `noImage:true`). This polyfill is a no-op when the helper is already provided.
(globalThis as any).__name ??= <T,>(fn: T, _name?: string): T => fn;

import { startServer } from './transport/ws.js';
import { controller } from './browser/controller.js';

const port = Number(process.env.PORT ?? 8080);
const host = process.env.BRIDGE_HOST ?? '127.0.0.1';
const homeUrl = process.env.BRIDGE_HOME_URL ?? `http://${host}:${port}/home`;

const headless = process.env.BRIDGE_HEADLESS !== 'false';
await controller.launch({ headless });
startServer(port);
setTimeout(async () => {
  try {
    const page = await controller.page();
    if (page.url() === 'about:blank') {
      await page.goto(homeUrl, { waitUntil: 'domcontentloaded' });
    }
  } catch (err: any) {
    log('warn', 'failed to open bridge home page', { error: err?.message ?? String(err), homeUrl });
  }
}, 250);
import { log } from './logger.js';

const shutdown = async () => {
  log('info', 'shutting down');
  await controller.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
