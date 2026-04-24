# Browser Bridge — API Reference

Commandes JSON-RPC exposées via WebSocket sur `/ws/browser-bridge`.

Format de requête :

```json
{ "id": "<id>", "type": "<command>", "payload": { ... } }
```

**Total : 60 commandes**

## Authentification

- `BRIDGE_TOKEN` : si défini, header `Authorization: Bearer <token>` (ou `?token=`) requis
- `BRIDGE_ALLOWED_ORIGINS` : CSV d'origines autorisées (rejet sinon)
- `BRIDGE_ADMIN_TOKEN` : requis pour `exec.script`, doit être fourni dans le payload (`adminToken`)

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
| `BRIDGE_TOKEN` | token d'auth WS | (vide = désactivé) |
| `BRIDGE_ADMIN_TOKEN` | token pour `exec.script` | (vide = commande désactivée) |
| `BRIDGE_ALLOWED_ORIGINS` | CSV origines autorisées | (vide = toutes) |
| `BRIDGE_DEFAULT_TIMEOUT_MS` | timeout défaut Playwright | 15000 |
| `BRIDGE_DEFAULT_NAV_TIMEOUT_MS` | timeout nav défaut | 20000 |
| `BRIDGE_LOG_JSON` | logs JSON si `1` | 0 |
| `BRIDGE_LOG_LEVEL` | niveau min logs | info |
