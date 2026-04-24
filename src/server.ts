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
