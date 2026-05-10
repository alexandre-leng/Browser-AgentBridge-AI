---
name: browser-bridge
description: |
  Browser automation via OpenClaw Browser Bridge.
  Default: MCP server (9 tools, simple). Advanced: JSON-RPC (80 commands, precise).
  Navigate, annotate, click, type, extract, human-like behavior.
version: 3.2.0
---

# 🦾 Skill: OpenClaw Browser Bridge

> **You are an AI agent with a browser.** You control it via `id`-based interaction (numerical refs). No coordinate guessing. No HTML parsing. Just stable element IDs.

## 🔀 One protocol to rule them all: MCP (default)

**Always start with MCP.** It exposes focused tools: `navigate`, `annotate_page`, `click_ref`, `type_ref`, `extract_schema`, `human_timing_get/set`, `human_antispam_check`.

- Connect via `openclaw-mcp` after `npm run build`
- Works with Claude Desktop, Codex, and any MCP client
- Simpler, smaller, enough for 80% of tasks

## ⚡ When to switch to JSON-RPC (advanced)

Only reach for WebSocket when you genuinely need one of these:
- Session isolation (`session.create` for parallel browsing)
- Human timing live feedback (`human.feedback` events)
- Low-level commands (`input.*`, `cookie.*`, `viewport.*`)
- Vision streaming (`vision.start/stop`)
- Batch execution via `script.execute`

Switch by connecting directly to `ws://localhost:8080/ws/browser-bridge`.

## 🪟 CLI (`bridge.cmd`) — for quick one-off commands

Use the `exec` tool for simple, single actions (quick test, navigate once). Not recommended as your primary approach.

---

## 1. Installation

### 1.1 Prérequis système
- **Node.js** ≥ 18 (testé jusqu'à Node 24)
- **npm** inclus avec Node.js
- **Git** (pour cloner le repo)
- **Chromium** ou **Chrome** installé (Playwright téléchargera le sien)

### 1.2 Cloner & installer
```bash
# 1. Aller dans le workspace OpenClaw
cd C:\Users\<USER>\.openclaw\workspace

# 2. Cloner le projet
git clone https://github.com/alexandre-leng/openclaw-browser-bridge.git

# 3. Installer les dépendances
cd openclaw-browser-bridge
npm install

# 4. Installer le navigateur Chromium pour Playwright
npx playwright install chromium
```

> **💡 Alternative rapide** : Si tu as déjà le dossier (par ex. copié depuis un autre poste), saute le `git clone` et lance juste `npm install` puis `npx playwright install chromium`.

### 1.3 Lancer le serveur
```bash
cd openclaw-browser-bridge
npm start
```

Vérifier que ça tourne : `http://localhost:8080/health` → `{ "status": "ok" }`

### 1.4 Vérifier que le CLI fonctionne
```bash
cd openclaw-browser-bridge
.\bridge.cmd navigate https://example.com
```

Si tu vois le titre de la page, tout est prêt.

---

## 2. Activation du skill dans OpenClaw

Pour qu'OpenClaw (l'agent) sache qu'il peut utiliser ce skill, il faut l'activer dans la config.

### 2.1 Vérifier que le skill est présent
Le skill doit être dans le dossier des skills de l'agent :
```bash
ls .openclaw\workspace\skills\browser-bridge\SKILL.md
```

Si tu viens de cloner le projet, copie-le :
```bash
mkdir -p .openclaw\workspace\skills\browser-bridge
copy openclaw-browser-bridge\SKILL.md .openclaw\workspace\skills\browser-bridge\SKILL.md
```

### 2.2 Activer dans openclaw.json
Ajoute ou vérifie cette entrée dans `.openclaw/openclaw.json` :

```json
"skills": {
  "entries": {
    "browser-bridge": {
      "enabled": true
    }
  }
}
```

### 2.3 Redémarrer OpenClaw
```bash
openclaw gateway restart
```

Après redémarrage, l'agent a accès à ce skill et l'utilise quand tu demandes d'aller sur un site, chercher quelque chose, cliquer, etc.

### 2.4 Installation via ClawHub (si dispo)
```bash
openclaw clawhub install browser-bridge
```

---

## 3. Identity & Endpoint

**What it is:** A headless Chromium browser controlled via JSON-RPC over WebSocket. Every interactive element gets a numeric `id` (`ref`) for precise interaction.

- WebSocket: `ws://localhost:8080/ws/browser-bridge`
- HTTP (health, captures, viewer): `http://localhost:8080`
- Live Viewer (ask human for CAPTCHA / complex logins): `http://localhost:8080/viewer`
- CLI: `bridge.cmd` (in the bridge project folder)

**Authentication:**
- If `BRIDGE_TOKEN` is set, send header `Authorization: Bearer <token>` on WS connect, or `?token=<token>` in the WS URL.
- For CLI: token is not needed (local only).

**MCP Server** (experimental): `npm run mcp` in bridge folder, or `openclaw-mcp` after build. Tools: `browser_status`, `navigate`, `annotate_page`, `click_ref`, `type_ref`, `extract_schema`, `human_timing_get`, `human_timing_set`, `human_antispam_check`. Raw `browser_command` requires `BRIDGE_MCP_ALLOW_RAW=1`.

---

## 4. Prerequisites

### Bridge server must be running
```bash
cd openclaw-browser-bridge && npm start
```
Verify: `http://localhost:8080/health`

### CLI location
`bridge.cmd` lives in the bridge project folder. Run commands from there or use the full path.

### Auto-Start Helper
Save as `bridge-check.cjs` in the bridge folder:

```javascript
const http = require('http');
const { spawn } = require('child_process');

function checkHealth() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:8080/health', (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => { req.destroy(); resolve(false); });
  });
}

async function main() {
  if (await checkHealth()) {
    console.log('✅ Bridge already running'); process.exit(0);
  }
  console.log('🚀 Starting bridge...');
  spawn('npm', ['start'], { cwd: __dirname, stdio: 'inherit', shell: true });
  await new Promise(r => setTimeout(r, 4000));
  console.log(await checkHealth() ? '✅ Started' : '⚠️  Still starting...');
}
main().catch(console.error);
```

### Reusable WS Client Helper
Save as `examples/quick-client.cjs`:

```javascript
const WebSocket = require('ws');
const WS_URL = 'ws://localhost:8080/ws/browser-bridge';

async function sendCommand(ws, cmd) {
  return new Promise((resolve) => {
    const handler = (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.id === cmd.id) { ws.off('message', handler); resolve(msg); }
      } catch (e) {}
    };
    ws.on('message', handler);
    ws.send(JSON.stringify(cmd));
  });
}

async function withBridge(fn) {
  const ws = new WebSocket(WS_URL);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  try { return await fn(ws); } finally { ws.close(); }
}

module.exports = { sendCommand, withBridge };
```

---

## 5. Mental Loop (OBLIGATORY)

**Never interact blindly. Follow this loop every time:**

```
1. ANNOTATE  →  bridge.cmd annotate  OR  page.annotate
   └─> Returns: elements[] with {id, role, name, text} + screenshot URL

2. REASON    →  Look at the screenshot, find the ref (id) in the JSON list

3. ACT       →  bridge.cmd click <ref>  OR  agent.click {ref: N}

4. VERIFY    →  bridge.cmd summary  OR  agent.summary / page.annotate
```

**Critical:** A `ref` from step 1 is **invalid** after navigation or DOM update. Always re-annotate.

---

## 6. CLI Approach (`bridge.cmd`)

Use the `exec` tool for quick, simple browser tasks.

### Basic pattern
```javascript
exec: {
  command: "bridge.cmd <command> [args]",
  workdir: "<path-to-openclaw-browser-bridge>"
}
```

### CLI Commands

| Command | Purpose | Example |
|---------|---------|---------|
| `navigate <url>` | Go to URL | `bridge.cmd navigate https://example.com` |
| `search <query>` | Search Google/Bing | `bridge.cmd search "OpenClaw"` |
| `annotate` | Screenshot + element list | `bridge.cmd annotate` |
| `annotate --no-image` | Element list **without screenshot** (10x faster) | `bridge.cmd annotate --no-image` |
| `click <ref>` | Click element by ID | `bridge.cmd click 7` |
| `type <ref> <text>` | Type into input | `bridge.cmd type 2 "formalibre"` |
| `press <key>` | Press Enter, Tab, Escape | `bridge.cmd press Enter` |
| `scroll <amount>` | Scroll by pixels | `bridge.cmd scroll 500` |
| `wait <ms>` | Wait milliseconds | `bridge.cmd wait 3000` |
| `wait --for text <text>` | Wait until text appears | `bridge.cmd wait --for text "Results"` |
| `extract <type>` | Extract structured data | `bridge.cmd extract article` |
| `summary` | Lightweight page summary | `bridge.cmd summary` |
| `visible-text --filter=...` | Extract visible text elements | `bridge.cmd visible-text --filter-any=Numéro,06,Adresse --filter-lines` |
| `run "cmd1" "cmd2" ...` | Execute multiple commands in batch | See §6 |

### Human-like CLI commands
| Command | Purpose | Example |
|---------|---------|---------|
| `scan --steps=N --filter=X` | Read visible text, scroll slowly | `bridge.cmd scan --steps=4 --filter-any=Restaurant,Adresse` |
| `find-text "..."` | Search text, scroll if needed | `bridge.cmd find-text "Le Ramus"` |
| `click-text "..."` | Find text + click (even non-button) | `bridge.cmd click-text "Le Ramus"` |
| `read` | Focused reading with human pauses | `bridge.cmd read` |
| `skim <steps> <px>` | Quick page scan with pauses | `bridge.cmd skim 4 420` |
| `idle <ms>` | Gentle mouse movement + reading pauses | `bridge.cmd idle 2500` |
| `jitter <radius> <count>` | Small hesitation movements | `bridge.cmd jitter 18 4` |
| `backtrack` | Scroll back up (human re-reading) | `bridge.cmd backtrack` |
| `focus-cycle <n>` | Tab through focusable elements | `bridge.cmd focus-cycle 3` |
| `go-back` / `go-forward` | History nav with human pause | `bridge.cmd go-back` |
| `antispam` | Check page for anti-bot detection | `bridge.cmd antispam` |
| `timing get` | View current human timing profile | `bridge.cmd timing get` |
| `timing set consultSpeed=1.6 ...` | Adjust timing profile at runtime | `bridge.cmd timing set consultSpeed=1.6 minFocusedMs=3500` |

### CLI Batch with `run`
```bash
bridge.cmd run "navigate https://duckduckgo.com/?q=formalibre" "wait 3000" "annotate --no-image"
```

Returns **all step results** by default — complete trace:

```json
{
  "ok": true,
  "results": [
    { "step": 0, "type": "navigate", "ok": true, "title": "formalibre at DuckDuckGo" },
    { "step": 1, "type": "wait", "ok": true },
    { "step": 2, "type": "page.annotate", "ok": true, "elements": 112 }
  ],
  "durationMs": 1345
}
```

---

## 7. JSON-RPC Approach (WebSocket)

For advanced, precise, multi-step workflows. **80 commands total** across 14 categories. Full reference in `docs/api.md` (auto-generated in bridge folder).

### Protocol

**Request:**
```json
{ "id": "<unique string>", "type": "<command.name>", "payload": { "key": "value" } }
```

**Success Response:**
```json
{ "id": "<same id>", "ok": true, "result": { /* command-specific */ } }
```

**Error Response:**
```json
{ "id": "<same id>", "ok": false, "error": "message", "code": "ERROR_CODE" }
```

### Command Families

#### 👁️ SEE — Understand the page
| Command | Purpose | Payload |
|---------|---------|---------|
| `page.annotate` | Screenshot + numbered element list | `{}` |
| `agent.summary` | Lightweight: URL, title, top elements | `{}` |
| `agent.tree` | Full ARIA accessibility tree | `{}` |
| `vision.screenshot` | Raw screenshot as base64 | `{}` |
| `vision.start` | Start real-time frame stream (broadcasts `vision.frame` events to all clients) | `{fps: number, annotate?: boolean}` |
| `vision.stop` | Stop real-time frame stream | `{}` |
| *(event)* `vision.frame` | Server-pushed frame event while streaming (use MD5 diffing) | `{frame: base64, timestamp, md5}` |
| `dom.visibleText` | Extract visible text with filters | `{query: ".css", filterAny: ["Numéro", "06"], filterLines: true, limit: 100}` |

#### 🧭 NAVIGATE — Move around
| Command | Purpose | Payload |
|---------|---------|---------|
| `navigate` | Go to URL | `{url: "https://..."}` |
| `agent.search` | Search Google/Bing | `{query: "...", engine: "google"}` |
| `combo.searchAndClick` | Search + click first result | `{query: "..."}` |
| `misc.search` | Alt. search interface | Depending on config |
| `tab.new` | Open new tab | `{url: "optional"}` |
| `tab.switch` | Switch to tab index | `{index: 0}` |
| `tab.close` | Close tab by index | `{index: 1}` |
| `tab.list` | List all open tabs | `{}` |
| `browser.close` | Close entire browser | `{}` |
| `browser.status` | Browser status info | `{}` |

#### 🖱️ ACT — Interact (always by `ref`)
| Command | Purpose | Payload |
|---------|---------|---------|
| `agent.click` | Click element #N | `{ref: 7}` |
| `agent.type` | Focus, clear, type text | `{ref: 7, text: "hello", clear: true}` |
| `agent.hover` | Hover over element | `{ref: 7}` |
| `agent.press` | Press key (Enter, Tab, Escape) | `{key: "Enter"}` |
| `agent.scroll` | Scroll up/down | `{direction: "down\|up", amount: 300}` |
| `agent.select` | Select dropdown option | `{ref: 7, option: "Label"}` |
| `agent.waitFor` | Wait for text/url/selector | `{for: "text", value: "...", timeout: 5000}` |

**Low-level alternatives** (for edge cases):
| Command | Purpose | Payload |
|---------|---------|---------|
| `dom.click` | Click element by CSS selector | `{selector: "button.primary"}` |
| `dom.type` | Type into selector | `{selector: "#search", text: "..."}` |
| `dom.fillForm` | Fill multiple fields at once | `{fields: {name: "Alex", email: "..."}}` |
| `dom.doubleClick` | Double-click | `{ref: 7}` or `{selector: "..."}` |
| `dom.submit` | Submit a form | `{ref: 7}` or `{selector: "..."}` |
| `dom.press` | Press key on element | `{ref: 7, key: "Enter"}` |
| `dom.scrollDown` / `dom.scrollUp` | Scroll element | `{ref: 7, amount: 300}` |
| `dom.search` | Search within DOM | `{text: "..."}` |
| `dom.select` | Select option by selector | `{ref: 7, value: "fr"}` |
| `dom.goto` | Navigate (raw DOM version) | `{url: "..."}` |
| `dom.hover` | Hover by selector | `{selector: "..."}` |

**Raw input commands** (bypass ref system):
| Command | Purpose | Payload |
|---------|---------|---------|
| `input.text` | Type text (no clear, appends) | `{text: "hello"}` |
| `input.focus` | Focus an element | `{ref: 7}` or `{selector: "..."}` |
| `input.keyDown` / `input.keyUp` | Key press raw | `{key: "Enter"}` |
| `input.mouseDown` / `input.mouseUp` | Mouse raw | `{x: 100, y: 200}` |
| `input.mouseMove` | Move mouse | `{x: 100, y: 200, steps: 5}` |
| `input.wheel` | Scroll wheel | `{deltaY: 300}` |

#### 👤 HUMAN — Simulate human behavior

These commands make automation look like a real person. Use them on sensitive sites.

| Command | Purpose | Payload |
|---------|---------|---------|
| `human.read` | Read visible text with human timing | `{focused: true}` |
| `human.scan` | Scroll + read progressively | `{steps: 4, filterAny: ["Restaurant", "Adresse"], filterLines: true}` |
| `human.skim` | Quick page skim with backscroll | `{steps: 4, scrollPx: 420}` |
| `human.findText` | Search visible text, scroll if needed | `{text: "Le Ramus", timeoutMs: 8000}` |
| `human.clickText` | Find text and click (even non-button) | `{text: "Le Ramus", timeoutMs: 15000}` |
| `human.explore` | Explore page content | — |
| `human.idle` | Mouse movement + reading pauses | `{ms: 2500}` |
| `human.jitter` | Small hesitation movements | `{radius: 18, count: 4}` |
| `human.backtrack` | Scroll back up (re-reading) | `{}` |
| `human.focusCycle` | Tab through focusable elements | `{maxTabs: 3}` |
| `human.goBack` / `human.goForward` | History with human pause | `{}` |
| `human.timing.get` | Get current human timing profile | `{}` |
| `human.timing.set` | Adjust human timing at runtime | See §7.1 below |
| `human.timing.reset` | Restore default timing profile | `{}` |
| `human.antispam.check` | Check page for anti-bot detection | `{}` |

##### 7.1 Human Timing Profile

Controls consultation speeds: reading, scanning, re-reading. Mouse/keyboard have their own human models.

**`human.timing.set` payload:**
```json
{
  "consultSpeed": 1.0,
  "focusedWpmMin": 150,
  "focusedWpmMax": 210,
  "skimWpmMin": 190,
  "skimWpmMax": 280,
  "minFocusedMs": 3500,
  "maxFocusedMs": 60000,
  "minSkimMs": 1500,
  "maxSkimMs": 25000,
  "feedbackIntervalMs": 800
}
```

| Field | Effect | Hint |
|-------|--------|------|
| `consultSpeed` | Multiplies all consultation times | `1` normal, `1.5` slower, `0.75` faster |
| `focusedWpmMin/Max` | Focused reading speed | Lower WPM = longer pauses |
| `skimWpmMin/Max` | Quick scan speed | Keep higher than focused WPM |
| `minFocusedMs/MaxFocusedMs` | Pause bounds for `human.read` | Increase on sensitive sites |
| `minSkimMs/MaxSkimMs` | Pause bounds for scan/search | Useful for long lists |
| `feedbackIntervalMs` | `human.feedback` event frequency | 500-1500ms is good |

**Recommended agent loop:**
1. Get profile with `human.timing.get` at session start
2. After navigation, prefer `human.read` or `human.scan` before clicking
3. On rapid feedback or sensitive pages, call `human.timing.set` with higher `consultSpeed` and longer minimums
4. Call `human.antispam.check` after repeated searches, result pages, or unusual behavior
5. If `blocked: true`, stop automation and request human intervention via Live Viewer

#### 📊 DATA — Extract structured content
| Command | Purpose | Payload |
|---------|---------|---------|
| `dom.extract` | Smart extraction by type | `{type: "search-results\|form\|article\|table\|google-maps\|listings"}` |
| `dom.html` | Inner HTML of selector | `{selector: "body"}` |
| `dom.waitFor` | Wait for element state | `{query: ".result", state: "visible", timeout: 10000}` |
| `dom.inspect` | Debug element by ref | `{ref: 7}` |
| `dom.visibleText` | Visible text with filters | `{textFilter: "...", filterAny: ["a", "b"], filterLines: true, limit: 100}` |

#### 🍪 STATE — Cookies & Viewport
| Command | Purpose | Payload |
|---------|---------|---------|
| `cookie.get` | Get all cookies | `{}` |
| `cookie.set` | Set a cookie | `{name: "session", value: "...", domain: ".site.com"}` |
| `viewport.set` | Resize viewport | `{width: 1920, height: 1080}` |

#### 🔄 ORCHESTRATE — Batch & pipeline
| Command | Purpose | Payload |
|---------|---------|---------|
| `script.execute` | Run multiple commands in one WS message | `{commands: [...], stopOnError: true}` |
| `misc.wait` | Wait for page event | `{ms: 3000}` or `{}` (load) |
| `screenshot` | Save screenshot | `{}` |

**Interpolation in batch:** Reference previous step results with `${stepN.path}`:
```json
{"type":"agent.click","payload":{"ref":"${step1.result.elements[0].id}"}}
```

#### 🔀 SESSION — Multi-browser isolation
| Command | Purpose |
|---------|---------|
| `session.create` | Create named browser context (payload: `{id: "my-session"}`) |
| `session.list` | List active sessions |
| `trace.list` | List trace events for a session | `{sessionId: "my-session"}` |
| `trace.save` | Save trace to disk | `{sessionId: "my-session"}` |
| `trace.artifacts` | List trace artifacts | `{}` |

Send `"sessionId": "my-session"` in any request to target a specific session.

#### UNSAFE — Requires admin
| Command | Purpose | Condition |
|---------|---------|-----------|
| `exec.script` | Execute arbitrary JS in page | Needs `BRIDGE_ADMIN_TOKEN` + `BRIDGE_ALLOW_EXEC_SCRIPT=1` |
| `agent.task` | LLM-driven high-level task | May need token |
| `agent.discoverScroll` | Auto-discover scrollable area | — |

### Real-time `human.feedback` Events

During `human.read`, `human.scan`, and `human.findText`, the bridge broadcasts WebSocket events `human.feedback` for live agent control:

```json
{
  "type": "human.feedback",
  "payload": {
    "phase": "consulting",
    "reason": "human.scan.step.2",
    "elapsedMs": 2400,
    "remainingMs": 5200,
    "progress": 0.31,
    "step": 2,
    "totalSteps": 4
  }
}
```

Phases: `consulting` (paused reading), `consulted` (done), `scrolling`, `timing.updated`, `timing.reset`, `antispam.ok`, `antispam.warning`.

---

## 8. Batch Execution (Both Approaches)

### CLI (bridge.cmd run)
```bash
bridge.cmd run "navigate https://site.com" "wait 2000" "annotate --no-image"
```

### JSON-RPC (script.execute)
```json
{"id":"1","type":"script.execute","payload":{
  "commands": [
    {"type":"navigate","payload":{"url":"https://site.com"}},
    {"type":"misc.wait","payload":{}},
    {"type":"page.annotate","payload":{}}
  ]
}}
```

---

## 9. Security Rules

**You MUST enforce these. Never bypass.**

| Rule | Detail |
|------|--------|
| `exec.script` | **Requires `adminToken`** matching `BRIDGE_ADMIN_TOKEN` env var. If not set, command is **disabled**. Never attempt without token. |
| URLs | Only `http:`, `https:`, `about:`, `file:` allowed. **Refuse** `javascript:`, `data:`, etc. |
| Cookies | Structurally validated server-side. Don't forge. |
| Rate limit | 100 messages/minute per client. Batch with `script.execute` to stay under limit. |
| Origins | If `BRIDGE_ALLOWED_ORIGINS` is set, rejected if Origin header doesn't match. |

---

## 10. Proven Patterns

### A. Search DuckDuckGo → Click First Result
**CLI:**
```bash
bridge.cmd run "navigate https://duckduckgo.com/?q=QUERY" "wait 3000" "annotate --no-image"
bridge.cmd click <ref>
```

**JSON-RPC:**
```json
{"id":"1","type":"script.execute","payload":{
  "commands": [
    {"type":"navigate","payload":{"url":"https://duckduckgo.com/?q=QUERY"}},
    {"type":"misc.wait","payload":{}},
    {"type":"page.annotate","payload":{}},
    {"type":"agent.click","payload":{"ref":25}}
  ]
}}
```

### B. Fill a Form
```bash
bridge.cmd annotate
bridge.cmd type <ref-username> "user@example.com"
bridge.cmd type <ref-password> "password123"
bridge.cmd click <ref-submit>
```

### C. Extract Data (Search Results / Articles / Tables)
```bash
bridge.cmd navigate https://example.com/portfolio
bridge.cmd extract article
```

### D. Scroll & Extract
```bash
bridge.cmd run "navigate https://site.com" "scroll 800" "extract article"
```

### E. Multi-Session Research (JSON-RPC only)
```json
{"id":"1","type":"session.create","payload":{"id":"research-1"}}
{"id":"2","type":"navigate","payload":{"url":"https://news.com"},"sessionId":"research-1"}
{"id":"3","type":"navigate","payload":{"url":"https://competitor.com"},"sessionId":"research-2"}
```

### F. Human-Like Consultation on Sensitive Pages
**JSON-RPC:**
```json
{"id":"t1","type":"human.timing.get","payload":{}}
{"id":"t2","type":"human.timing.set","payload":{"consultSpeed":1.6,"minFocusedMs":4000}}
{"id":"a1","type":"human.read","payload":{"focused":true}}
{"id":"a2","type":"human.scan","payload":{"steps":4,"filterAny":["Restaurant","Adresse"]}}
{"id":"c1","type":"human.antispam.check","payload":{}}
```

**CLI equivalent:**
```bash
bridge.cmd timing set consultSpeed=1.6 minFocusedMs=4000
bridge.cmd read
bridge.cmd scan --steps=4 --filter-any=Restaurant,Adresse
```

### G. Click Text Without Known Ref (text-based clicking)
```bash
bridge.cmd click-text "Ajouter au panier"
bridge.cmd click-text "Rechercher dans cette zone" --timeout-ms=15000
```

```json
{"id":"g1","type":"human.clickText","payload":{"text":"Ajouter au panier"}}
```

### H. Windows / PowerShell Filtering
Prefer comma-separated filters on Windows:

```powershell
.\bridge.cmd visible-text --filter-any=Formation,IA,Marseille --filter-lines
.\bridge.cmd scan --steps=4 --filter-any=Restaurant,Adresse
```

`--filter-any=a,b,c` matches any term without relying on `|`, which `cmd.exe` can treat as a pipeline before Node receives the argument. `--filter-lines` applies filtering after extraction and returns only matching lines. Regex filters still work with `--filter="Formation|IA|Marseille"` in shells that preserve the pipe correctly.

### I. Resilient Workflow (Complete)
```bash
# Step 1: Navigate, wait, annotate (fast)
bridge.cmd run "navigate https://duckduckgo.com/?q=formalibre" "wait 3000" "annotate --no-image"

# Step 2: Click result
bridge.cmd click <ref>

# Step 3: Wait and extract
bridge.cmd run "wait 4000" "extract article"
```

### J. From Zero: First-Time Setup → First Action
```bash
# Si le bridge n'est pas lancé, le lancer d'abord dans un terminal séparé :
cd openclaw-browser-bridge && npm start

# Puis :
bridge.cmd run "navigate https://example.com" "wait 1000" "annotate --no-image"
# → Tu vois les éléments, leurs refs, le titre
```

---

## 11. Error Handling & Recovery

| Error | Cause | Recovery |
|-------|-------|----------|
| `Connection refused` | Bridge server not running | Start server: `cd openclaw-browser-bridge && npm start` |
| `Element not found` | Page changed, ref is stale | Re-annotate, get new `ref`. Bridge returns suggestions if available. |
| `Element not found + suggestions` | Bridge suggests similar refs | Use the suggested `ref` if semantically correct |
| `Timeout` | Element didn't appear | Increase wait, retry with `agent.waitFor`/`wait --for text` |
| `Navigation aborted` | Redirect or popup blocker | Re-run `navigate` with full URL |
| `Protocol not allowed` | URL uses `javascript:` etc. | Use only `http/https/about/file` |
| `annotate` too large | Base64 screenshot embedded | Use `--no-image` or `result.imageUrl` (ignore base64 field) |
| `dom.html` timeout | Heavy DOM | Use `dom.extract` instead |
| `extract` returns empty | Wrong type or no data | Try `summary` or `annotate` first |
| `exec.script disabled` | Token not set | Ask human; never bypass |
| `bridge.cmd` not found | Not in PATH | Run from bridge folder |
| `npm install` fails | Missing dependencies | Run `npm install` in bridge folder |
| `npx playwright install` needed | Browser not found | Run `npx playwright install chromium` |
| ESM error | `package.json` has `"type": "module"` | Use `.cjs` extension |
| Slow/blocking sites | Anti-bot | Test with fast site first, increase wait; use `human.*` commands |
| Anti-bot detected | `human.antispam.check` returns `blocked: true` | Stop automation → ask human for Live Viewer |
| Skill not available | Skill désactivé dans openclaw.json | Vérifier §2.2, activer et redémarrer |

**Auto-navigation after `agent.press Enter`:** Server waits for `domcontentloaded`, but insert a `misc.wait` / `wait` step to be safe.

---

## 12. Performance Optimizations

### `--no-image` : Annotate without screenshot (10x faster)
```bash
bridge.cmd annotate --no-image
```
Returns: `elements[]`, `url`, `title` — no heavy base64 payload.

### Batch with full trace
Both CLI `run` and `script.execute` return all step results, plus `durationMs`.

### Combine for maximum speed
```bash
bridge.cmd run "navigate https://example.com" "wait 500" "annotate --no-image" "summary"
```
Typical execution: **< 1 second** for 4 commands.

### Prefer lightweight commands
- `agent.summary` over `page.annotate` when you just need context
- `--no-image` over default annotate when you only need element IDs
- `dom.extract` over `dom.html` for structured data
- `human.read` over manual scroll+annotate for long pages

---

## 13. Environment Variables Reference

| Variable | Role | Default |
|----------|------|---------|
| `PORT` | HTTP/WS port | 8080 |
| `BRIDGE_HOST` | Bind host | 127.0.0.1 |
| `BRIDGE_URL` | WS URL for TypeScript CLI | `ws://localhost:8080/ws/browser-bridge` |
| `BRIDGE_TOKEN` | WS auth token | empty (ok locally) |
| `BRIDGE_ADMIN_TOKEN` | Token for `exec.script` | empty = cmd disabled |
| `BRIDGE_ALLOW_EXEC_SCRIPT` | Enable `exec.script` if `1` | 0 |
| `BRIDGE_ALLOW_FILE_URLS` | Enable `file:` navigation if `1` | 0 |
| `BRIDGE_ALLOWED_FILE_ROOTS` | CSV of allowed `file:` roots | empty |
| `CHROME_CHANNEL` | Playwright browser channel | chrome |
| `CHROME_PROFILE` | Persistent Chrome profile dir | empty |
| `CHROME_CDP_URL` | Connect to existing browser via CDP | empty |
| `BRIDGE_PLAYWRIGHT_SLOWMO_MS` | Slow down Playwright actions | 0 |
| `BRIDGE_BRING_TO_FRONT` | Bring active page to front | 1 |
| `BRIDGE_POLITE_MODE` | Domain rate-limit + anti-bot (0=off) | 1 |
| `BRIDGE_POLITE_MIN_DELAY_MS` | Min delay between navs to same host | 12000 |
| `BRIDGE_AUTO_COOKIES` | Auto-handle known cookie banners | 1 |
| `BRIDGE_HUMAN_WARMUP` | Post-nav human movements/pauses | 1 |
| `BRIDGE_PAGE_WARMUP_MS` | Warmup duration after nav | 2500 |
| `BRIDGE_HUMAN_CONSULT_SPEED` | Initial human consult multiplier | `BRIDGE_DEMO_SPEED` or 1 |
| `BRIDGE_DEMO_SPEED` | General movement/pause multiplier | 1 |
| `BRIDGE_VISIBLE_CURSOR` | Show visual cursor injection | 1 |
| `BRIDGE_ALLOWED_ORIGINS` | CSV of allowed origins | empty = all |
| `BRIDGE_DEFAULT_TIMEOUT_MS` | Default Playwright timeout | 15000 |
| `BRIDGE_DEFAULT_NAV_TIMEOUT_MS` | Default navigation timeout | 20000 |
| `BRIDGE_LOG_JSON` | JSON logs if `1` | 0 |
| `BRIDGE_LOG_LEVEL` | Minimum log level | info |
| `BRIDGE_MCP_ALLOW_RAW` | Expose raw MCP tool `browser_command` | 0 |

---

## 14. Quick Reference

| # | Friction | Solution | Where |
|---|----------|----------|-------|
| 1 | Bridge pas installé | `git clone + npm install + npx playwright install chromium` | §1 |
| 2 | Skill pas activé | Ajouter `browser-bridge: { enabled: true }` dans openclaw.json | §2 |
| 3 | CLI not in PATH | Run from bridge folder | §6 |
| 4 | Writing boilerplate | Use `bridge.cmd` or `examples/quick-client.cjs` | §4, §6 |
| 5 | DDG search not via `search` | `navigate` with direct DDG URL (Pattern A) | §10A |
| 6 | `dom.html` timeout | Use `dom.extract` instead | §11 |
| 7 | `annotate` too large | `--no-image` or `result.imageUrl` | §12, §11 |
| 8 | Bridge not running | `bridge-check.cjs` auto-starter | §4 |
| 9 | Need human-like behavior | `human.*` commands (read, scan, clickText, antispam) | §7 |
| 10 | Anti-bot detection | `human.antispam.check`, slow down with `human.timing.set` | §7.1 |
| 11 | Text not in clickable element | `human.clickText` / `dom.visibleText` | §7 |
| 12 | Missing patterns | Patterns A-I cover most cases | §10 |

## 15. Do / Don't

✅ **DO:**
- Always start with `annotate` on an unknown page
- Use batch (`run` / `script.execute`) for multi-step workflows
- Prefer `summary` over `annotate` when you just need context
- Use `dom.extract` / `dom.visibleText` instead of parsing raw text
- Wait after navigation before re-annotating
- Use `sessionId` to isolate parallel tasks
- Use `human.*` on sensitive sites that might detect automation
- Ask human for **Live Viewer** at `http://localhost:8080/viewer` when stuck on CAPTCHA or complex logins
- Prefer `human.clickText` when you know the label but not the ref

❌ **DON'T:**
- Guess CSS selectors or coordinates — use `ref` from `annotate`
- Trust a `ref` after navigation — always re-annotate
- Call `exec.script` without `adminToken`
- Send commands one-by-one if they belong together
- Bypass security rules (javascript: URLs, cookies forging, etc.)
- Continue automation if `human.antispam.check` returns `blocked: true`

---

## 16. Self-Improvement Protocol

At the end of every browsing session, reflect and propose updates.

### During the task
- Note every unexpected behavior (modal popup, cookie banner, dynamic iframe)
- Note which `ref` strategy worked or failed
- Record timing: how many steps, how many re-annotations needed

### At task end
Propose edits:
```markdown
## 📝 Proposed skill updates

### New pattern discovered
[Describe the situation and the solution]

### Trap discovered
[What went wrong and how to avoid it]

### Suggested skill edit
```diff
- [old text from skill]
+ [new text]
```
```

**Rules:**
- Never remove or weaken the **Security Rules** section without human approval
- Prefer adding to "Patterns" or "Errors" sections
- Keep the skill compact — if you add 10 lines, propose removing 5 obsolete ones
- The human decides whether to apply the diff

---

## 17. Complete Reference

For the exhaustive list of all 80 commands, exact payloads, and return types:
- **`docs/api.md`** (auto-generated) in the bridge project folder

For the human-oriented workflow guide:
- **`AGENT-GUIDE.md`** in the bridge project folder

For environment variables and security hardening:
- **`README.md`** → Security & Environment Variables

---

*Skill version: 3.2.0 | Bridge version: 3.2+ | Last updated: 2026-05-05*
