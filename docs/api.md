# Browser Bridge — API Reference

Version documentée : `3.2.0`.

Commandes JSON-RPC exposées via WebSocket sur `/ws/browser-bridge`.

Format de requête :

```json
{ "id": "<id>", "type": "<command>", "payload": { ... } }
```

**Total : 63 commandes**

## Authentification

- `BRIDGE_TOKEN` : header `Authorization: Bearer <token>` (ou `?token=`). Obligatoire si `BRIDGE_HOST` n'est pas local.
- `BRIDGE_ALLOWED_ORIGINS` : CSV d'origines autorisées (rejet sinon)
- `BRIDGE_ALLOW_EXEC_SCRIPT=1` + `BRIDGE_ADMIN_TOKEN` : requis pour `exec.script`, token à fournir dans le payload (`adminToken`)
- `BRIDGE_ALLOW_FILE_URLS=1` + `BRIDGE_ALLOWED_FILE_ROOTS` : requis pour naviguer vers `file:`.

## MCP

Serveur MCP officiel via stdio : `npm run mcp` ou `openclaw-mcp` après build.

Outils MCP principaux : `browser_status`, `navigate`, `annotate_page`, `click_ref`, `type_ref`, `extract_schema`. Outil bas niveau `browser_command` activable via `BRIDGE_MCP_ALLOW_RAW=1`.

## Commandes par catégorie

### `agent`

- `agent.click`
- `agent.hover`
- `agent.press`
- `agent.scroll`
- `agent.search`
- `agent.select`
- `agent.summary`
- `agent.task`
- `agent.tree`
- `agent.type`
- `agent.waitFor`

### `browser`

- `browser.close`
- `browser.status`

### `combo`

- `combo.searchAndClick`

### `cookie`

- `cookie.get`
- `cookie.set`

### `dom`

- `dom.click`
- `dom.doubleClick`
- `dom.extract`
- `dom.fillForm`
- `dom.goto`
- `dom.hover`
- `dom.html`
- `dom.inspect`
- `dom.press`
- `dom.scrollDown`
- `dom.scrollUp`
- `dom.search`
- `dom.select`
- `dom.submit`
- `dom.type`
- `dom.waitFor`

### `exec`

- `exec.script`

### `human`

- `human.explore`
- `human.read`

### `input`

- `input.focus`
- `input.keyDown`
- `input.keyUp`
- `input.mouseDown`
- `input.mouseMove`
- `input.mouseUp`
- `input.text`
- `input.wheel`

### `misc`

- `navigate`
- `ping`
- `screenshot`
- `search`
- `wait`

### `page`

- `page.annotate`

### `script`

- `script.execute`

### `session`

- `session.create`
- `session.list`

### `tab`

- `tab.close`
- `tab.list`
- `tab.new`
- `tab.switch`

### `trace`

- `trace.artifacts`
- `trace.list`
- `trace.save`

### `viewport`

- `viewport.set`

### `vision`

- `vision.screenshot`
- `vision.start`
- `vision.stop`

## Variables d'environnement

| Variable | Rôle | Défaut |
|---|---|---|
| `PORT` | port HTTP/WS | 8080 |
| `BRIDGE_HOST` | host de bind | 127.0.0.1 |
| `BRIDGE_TOKEN` | token d'auth WS, obligatoire hors localhost | (vide autorisé localement) |
| `BRIDGE_ADMIN_TOKEN` | token pour `exec.script` | (vide = commande désactivée) |
| `BRIDGE_ALLOW_EXEC_SCRIPT` | active `exec.script` si `1` | 0 |
| `BRIDGE_ALLOW_FILE_URLS` | active navigation `file:` si `1` | 0 |
| `BRIDGE_ALLOWED_FILE_ROOTS` | CSV de racines autorisées pour `file:` | (vide) |
| `BRIDGE_POLITE_MODE` | ralentissement par domaine + détection anti-bot (`0` désactive) | 1 |
| `BRIDGE_POLITE_MIN_DELAY_MS` | délai minimum entre navigations vers le même host | 12000 |
| `BRIDGE_ALLOWED_ORIGINS` | CSV origines autorisées | (vide = toutes) |
| `BRIDGE_DEFAULT_TIMEOUT_MS` | timeout défaut Playwright | 15000 |
| `BRIDGE_DEFAULT_NAV_TIMEOUT_MS` | timeout nav défaut | 20000 |
| `BRIDGE_LOG_JSON` | logs JSON si `1` | 0 |
| `BRIDGE_LOG_LEVEL` | niveau min logs | info |
