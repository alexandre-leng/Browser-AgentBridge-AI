import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { buildHandlers } from '../src/browser/handlers/index.js';
import { VERSION } from '../src/version.js';

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
lines.push(`Version documentée : \`${VERSION}\`.`);
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
lines.push('- `BRIDGE_TOKEN` : header `Authorization: Bearer <token>` (ou `?token=`). Obligatoire si `BRIDGE_HOST` n\'est pas local.');
lines.push('- `BRIDGE_ALLOWED_ORIGINS` : CSV d\'origines autorisées (rejet sinon)');
lines.push('- `BRIDGE_ALLOW_EXEC_SCRIPT=1` + `BRIDGE_ADMIN_TOKEN` : requis pour `exec.script`, token à fournir dans le payload (`adminToken`)');
lines.push('- `BRIDGE_ALLOW_FILE_URLS=1` + `BRIDGE_ALLOWED_FILE_ROOTS` : requis pour naviguer vers `file:`.');
lines.push('');
lines.push('## MCP');
lines.push('');
lines.push('Serveur MCP officiel via stdio : `npm run mcp` ou `openclaw-mcp` après build.');
lines.push('');
lines.push('Outils MCP principaux : `browser_status`, `navigate`, `annotate_page`, `click_ref`, `type_ref`, `extract_schema`. Outil bas niveau `browser_command` activable via `BRIDGE_MCP_ALLOW_RAW=1`.');
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
lines.push('| `BRIDGE_TOKEN` | token d\'auth WS, obligatoire hors localhost | (vide autorisé localement) |');
lines.push('| `BRIDGE_ADMIN_TOKEN` | token pour `exec.script` | (vide = commande désactivée) |');
lines.push('| `BRIDGE_ALLOW_EXEC_SCRIPT` | active `exec.script` si `1` | 0 |');
lines.push('| `BRIDGE_ALLOW_FILE_URLS` | active navigation `file:` si `1` | 0 |');
lines.push('| `BRIDGE_ALLOWED_FILE_ROOTS` | CSV de racines autorisées pour `file:` | (vide) |');
lines.push('| `BRIDGE_POLITE_MODE` | ralentissement par domaine + détection anti-bot (`0` désactive) | 1 |');
lines.push('| `BRIDGE_POLITE_MIN_DELAY_MS` | délai minimum entre navigations vers le même host | 12000 |');
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
