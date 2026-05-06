// esbuild emits a `__name(fn, name)` helper to preserve class/function names when
// running through `tsx`. In some Node versions the helper isn't defined globally,
// causing `ReferenceError: __name is not defined` deep inside class definitions
// (manifests as `__name undefined` when callers like `agent.summary` run with
// `noImage:true`). This polyfill is a no-op when the helper is already provided.
(globalThis as any).__name ??= <T,>(fn: T, _name?: string): T => fn;

import { startServer } from './transport/ws.js';
import { controller } from './browser/controller.js';

const port = Number(process.env.PORT ?? 8080);

await controller.launch({ headless: false });
startServer(port);
import { log } from './logger.js';

const shutdown = async () => {
  log('info', 'shutting down');
  await controller.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
