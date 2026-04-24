import { startServer } from './transport/ws.js';
import { controller } from './browser/controller.js';

const port = Number(process.env.PORT ?? 8080);

await controller.launch({ headless: false });
startServer(port);

const shutdown = async () => {
  console.log('[bridge] shutting down');
  await controller.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
