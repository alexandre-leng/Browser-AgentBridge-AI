import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { buildHandlers } from '../src/browser/handlers/index.js';

const handlers = buildHandlers(() => {}, async () => null);
const names = Object.keys(handlers).sort();

const groups: Record<string, string[]> = {};
for (const n of names) {
  const prefix = n.includes('.') ? n.split('.')[0] : 'misc';
  (groups[prefix] ??= []).push(n);
}

const lines: string[] = [];
lines.push('# Browser Bridge — API Reference');
lines.push('');
lines.push('Commandes JSON-RPC exposées via WebSocket sur `/ws/browser-bridge`.');
lines.push('');
lines.push('Format de requête :');
lines.push('');
lines.push('```json');
lines.push('{ "id": "<id>", "type": "<command>", "payload": { ... } }');
lines.push('```');
lines.push('');
lines.push(`**Total : ${names.length} commandes**`);
lines.push('');
lines.push('## Authentification');
lines.push('');
lines.push('- `BRIDGE_TOKEN` : si défini, header `Authorization: Bearer <token>` (ou `?token=`) requis');
lines.push('- `BRIDGE_ALLOWED_ORIGINS` : CSV d\'origines autorisées (rejet sinon)');
lines.push('- `BRIDGE_ADMIN_TOKEN` : requis pour `exec.script`, doit être fourni dans le payload (`adminToken`)');
lines.push('');
lines.push('## Commandes par catégorie');
lines.push('');

for (const grp of Object.keys(groups).sort()) {
  lines.push(`### \`${grp}\``);
  lines.push('');
  for (const n of groups[grp].sort()) {
    lines.push(`- \`${n}\``);
  }
  lines.push('');
}

lines.push('## Variables d\'environnement');
lines.push('');
lines.push('| Variable | Rôle | Défaut |');
lines.push('|---|---|---|');
lines.push('| `PORT` | port HTTP/WS | 8080 |');
lines.push('| `BRIDGE_HOST` | host de bind | 127.0.0.1 |');
lines.push('| `BRIDGE_TOKEN` | token d\'auth WS | (vide = désactivé) |');
lines.push('| `BRIDGE_ADMIN_TOKEN` | token pour `exec.script` | (vide = commande désactivée) |');
lines.push('| `BRIDGE_ALLOWED_ORIGINS` | CSV origines autorisées | (vide = toutes) |');
lines.push('| `BRIDGE_DEFAULT_TIMEOUT_MS` | timeout défaut Playwright | 15000 |');
lines.push('| `BRIDGE_DEFAULT_NAV_TIMEOUT_MS` | timeout nav défaut | 20000 |');
lines.push('| `BRIDGE_LOG_JSON` | logs JSON si `1` | 0 |');
lines.push('| `BRIDGE_LOG_LEVEL` | niveau min logs | info |');
lines.push('');

const out = join(process.cwd(), 'docs', 'api.md');
await mkdir(join(process.cwd(), 'docs'), { recursive: true });
await writeFile(out, lines.join('\n'), 'utf8');
console.log(`Wrote ${out} (${names.length} commands)`);
