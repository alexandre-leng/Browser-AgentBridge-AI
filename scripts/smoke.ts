import { startServer } from '../src/transport/ws.js';
const port = Number(process.env.PORT ?? 8765);
startServer(port);
