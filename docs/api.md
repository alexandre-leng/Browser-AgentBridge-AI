# Browser Bridge API Reference

Documented version: `3.2.0`.

JSON-RPC commands are exposed over WebSocket at `/ws/browser-bridge`.

Request format:

```json
{ "id": "<id>", "type": "<command>", "payload": { } }
```

**Total: 85 commands**

## Authentication

- `BRIDGE_TOKEN`: `Authorization: Bearer <token>` header, or `?token=`. Required when `BRIDGE_HOST` is not local.
- `BRIDGE_ALLOWED_ORIGINS`: comma-separated list of allowed origins. Other origins are rejected.
- `BRIDGE_ALLOW_EXEC_SCRIPT=1` plus `BRIDGE_ADMIN_TOKEN`: required for `exec.script`; pass the token in `payload.adminToken`.
- `BRIDGE_ALLOW_FILE_URLS=1` plus `BRIDGE_ALLOWED_FILE_ROOTS`: required for `file:` navigation.

## MCP

Official MCP server over stdio: `npm run mcp`, or `openclaw-mcp` after build.

Main MCP tools: `browser_status`, `navigate`, `annotate_page`, `click_ref`, `type_ref`, `extract_schema`, `web_search`, `inspect_forms`, `fill_form`, `submit_form`, `site_search`, `extract_marketplace`, `human_timing_get`, `human_timing_set`, and `human_antispam_check`.

The low-level `browser_command` tool is disabled by default and can be enabled with `BRIDGE_MCP_ALLOW_RAW=1`.

MCP resource: `api` (`openclaw://api`) exposes the registered bridge command list. MCP prompt: `browser_task` provides a ref-oriented browser task template.

## Commands By Category

### `agent`

- `agent.click`
- `agent.discoverScroll`
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
- `dom.visibleText`
- `dom.waitFor`

### `exec`

- `exec.script`

### `form`

- `form.fill`
- `form.inspect`
- `form.search`
- `form.submit`

### `human`

- `human.antispam.check`
- `human.backtrack`
- `human.clickText`
- `human.explore`
- `human.findText`
- `human.focusCycle`
- `human.goBack`
- `human.goForward`
- `human.idle`
- `human.jitter`
- `human.read`
- `human.scan`
- `human.skim`
- `human.timing.get`
- `human.timing.reset`
- `human.timing.set`

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

- `batch`
- `navigate`
- `ping`
- `screenshot`
- `search`
- `wait`

### `page`

- `page.annotate`

### `script`

- `script.execute`

### `scrape`

- `scrape.results`

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

### `web`

- `web.search`

## Useful Commands

### `web.search`

Runs a complete web search workflow from the browser: opens the search engine, uses the visible search form when possible, extracts structured results, paginates automatically, deduplicates URLs, and returns a run report.

Payload:

```json
{
  "query": "asian cats",
  "engine": "google",
  "limit": 20,
  "pages": 3,
  "organicOnly": false
}
```

CLI:

```bash
node bridge-cli.cjs webSearch "asian cats" --limit=20 --engine=google
```

Associated MCP tool: `web_search`.

### `dom.visibleText`

Extracts text that is actually visible in the DOM, element by element, even when the content is not exposed as a link, button, or article. This is useful on JavaScript-heavy pages such as Google Maps, where a phone number can appear inside a plain visible `div`.

Payload:

```json
{
  "query": ".optional-root-css-selector",
  "textFilter": "Phone|Address",
  "filterAny": ["Phone", "Address"],
  "filterLines": true,
  "limit": 100,
  "includeHidden": false
}
```

`textFilter` remains a regular expression. On Windows and PowerShell, prefer `filterAny` or `--filter-any=a,b,c` so `cmd.exe` cannot interpret `|` as a pipeline before Node receives the argument. `filterLines` filters line by line after extraction.

Response:

```json
{
  "type": "visible-text",
  "count": 1,
  "items": [
    {
      "text": "+33 6 58 47 70 24",
      "tag": "div",
      "selector": "div.Io6YTe.fontBodyMedium.kR99db",
      "box": { "x": 500, "y": 662, "w": 402, "h": 40 }
    }
  ]
}
```

CLI:

```bash
node bridge-cli.cjs visibleText --filter-any=Phone,Address --filter-lines --limit=50
node bridge-cli.cjs visible-text --filter-any=Phone,Address --filter-lines --limit=50
```

### `dom.extract` With `type: "listings"`

Extracts a structured list from result cards, directories, Google Maps, Yellow Pages, or generic listing pages.

Payload:

```json
{ "type": "listings" }
```

Response:

```json
{
  "type": "listings",
  "listings": [
    {
      "name": "Ottho - No Code and AI Training",
      "rating": 5,
      "reviews": 186,
      "address": "11 Rue Montgrand, Marseille",
      "phone": "+33 7 57 59 77 84",
      "website": "https://...",
      "hours": "Open - Closes at 18:00",
      "summary": "Excellent experience..."
    }
  ]
}
```

CLI:

```bash
node bridge-cli.cjs extract listings
```

### Forms And Authenticated Site Search

These commands help an agent work inside a legitimate browser session, for example a site that is already signed in through `CHROME_PROFILE` or `CHROME_CDP_URL`. They do not bypass captchas, anti-bot blocks, or access controls. If a site asks for human intervention, complete that step in the visible browser.

#### `form.inspect`

Maps visible forms and fields on the active page: labels, names, placeholders, types, selectors, list options, and required/disabled state.

```json
{ "id": "f1", "type": "form.inspect", "payload": {} }
```

#### `form.fill`

Fills fields either by selector or by logical name (`label` or `name`). Supports text fields, textareas, selects, checkboxes, radio buttons, and file inputs.

```json
{
  "id": "f2",
  "type": "form.fill",
  "payload": {
    "values": {
      "Search": "supplier invoices April 2026",
      "Status": "Paid",
      "Include archives": true
    }
  }
}
```

Detailed format:

```json
{
  "fields": [
    { "label": "Name", "value": "Durand" },
    { "selector": "input[name='date']", "value": "2026-05-19" }
  ],
  "clearFirst": true
}
```

#### `form.submit`

Submits the active form by clicking a given button, detecting a common submit button, or pressing Enter.

```json
{ "id": "f3", "type": "form.submit", "payload": { "query": "Search" } }
```

#### `form.search`

Automatically finds the visible search field on the active page, types the query, then submits. This is the most convenient command for searching inside an intranet, CRM, mailbox, or already-authenticated portal.

```json
{
  "id": "s1",
  "type": "form.search",
  "payload": {
    "query": "supplier contract 2026",
    "field": "Search"
  }
}
```

Associated MCP tools: `inspect_forms`, `fill_form`, `submit_form`, `site_search`.

### Marketplace Extraction

`dom.extract` accepts `type: "marketplace"` for classified-ad and marketplace result pages. The extractor combines DOM hints with visible text, removes `style/script` noise, deduplicates cards, respects `limit`, and can return JSON or CSV.

Payload:

```json
{
  "type": "marketplace",
  "limit": 10,
  "format": "json"
}
```

Response:

```json
{
  "type": "marketplace",
  "count": 1,
  "items": [
    {
      "title": "Cookeo Touch Wifi",
      "price": "180 EUR",
      "location": "Puteaux 92800",
      "category": "Home appliances",
      "delivery": false,
      "sponsored": false,
      "url": "https://www.leboncoin.fr/ad/electromenager/...",
      "image": "https://...",
      "summary": "Cookeo Touch Wifi 180 EUR ..."
    }
  ]
}
```

Dedicated command:

```json
{
  "id": "m1",
  "type": "scrape.results",
  "payload": {
    "type": "marketplace",
    "limit": 10,
    "format": "csv"
  }
}
```

CLI:

```bash
node bridge-cli.cjs extract marketplace --limit=10
node bridge-cli.cjs scrape --limit=10 --format=csv --out=results.csv
openclaw-bridge extract marketplace --limit=10 --format=json
```

Associated MCP tool: `extract_marketplace`.

### Human Capabilities

- `human.timing.get` returns the active consultation timing profile.
- `human.timing.set` adjusts timing live (`consultSpeed`, WPM, min/max, feedback cadence) to slow down or speed up page consultation without restarting.
- `human.timing.reset` restores the default profile.
- `human.antispam.check` inspects the page and returns a structured warning instead of throwing.
- `human.scan` reads visible text, scrolls slowly, then reads again. It accepts `textFilter`, `filterAny`, and `filterLines`.
- `human.findText` searches visible text and scrolls if needed, with a global bounded timeout via `timeoutMs`.
- `human.clickText` searches visible text, logs stages (`finding`, `coordinates`, `clicking`), then clicks the center of the found element. If the coordinate click fails, it attempts an `agent.click` fallback on an annotated ref.
- `human.idle` gently moves the mouse and pauses like a reader.
- `human.jitter` adds small hesitation movements around the current cursor position.
- `human.skim` scans a page with progressive scrolls, pauses, and small backtracks.
- `human.backtrack` scrolls slightly upward, useful when rereading a zone.
- `human.focusCycle` cycles focusable elements with `Tab`.
- `human.goBack` / `human.goForward` use browser history with a human pause.

CLI:

```bash
node bridge-cli.cjs scan --steps=4 --filter-any=Restaurant,Address,Phone
node bridge-cli.cjs find-text "Le Ramus"
node bridge-cli.cjs click-text "Le Ramus" --timeout-ms=15000
node bridge-cli.cjs idle 2500
node bridge-cli.cjs jitter 18 4
node bridge-cli.cjs skim 4 420
node bridge-cli.cjs backtrack
node bridge-cli.cjs focus-cycle 3
node bridge-cli.cjs timing get
node bridge-cli.cjs timing set consultSpeed=1.6 minFocusedMs=3500 feedbackIntervalMs=800
node bridge-cli.cjs antispam
```

### Human Timing Profile

The timing profile only controls consultation delays: reading, scanning, and rereading a found result. Mouse movement, clicks, and typing keep their own human-like models.

Payload for `human.timing.set`:

```json
{
  "consultSpeed": 1.6,
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

| Field | Effect | Guidance |
|---|---|---|
| `consultSpeed` | Multiplies all consultation delays | `1` normal, `1.5` slower, `0.75` faster |
| `focusedWpmMin` / `focusedWpmMax` | Careful reading speed | Lower WPM extends pauses |
| `skimWpmMin` / `skimWpmMax` | Fast scanning speed | Keep higher than focused WPM |
| `minFocusedMs` / `maxFocusedMs` | Pause bounds for focused `human.read` | Increase on sensitive sites |
| `minSkimMs` / `maxSkimMs` | Pause bounds for scanning and text search | Useful for long lists |
| `feedbackIntervalMs` | `human.feedback` event cadence | 500-1500 ms gives good real-time feedback |

Typical response:

```json
{
  "ok": true,
  "timing": {
    "consultSpeed": 1.6,
    "focusedWpmMin": 150,
    "focusedWpmMax": 210,
    "feedbackIntervalMs": 800
  }
}
```

### Real-Time Feedback

During `human.read`, `human.scan`, and `human.findText`, the bridge broadcasts WebSocket `human.feedback` events. They do not replace the final command response; they help an agent loop adapt while the consultation is still running.

Example event:

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
    "totalSteps": 4,
    "timing": { "consultSpeed": 1.6, "feedbackIntervalMs": 800 }
  }
}
```

Common phases:

- `consulting`: reading or rereading pause in progress.
- `consulted`: consultation finished.
- `scrolling`: page movement before another read.
- `timing.updated` / `timing.reset`: live timing profile change.
- `antispam.ok` / `antispam.warning`: anti-spam check result.

### Recommended Agent Loop

1. Read the profile with `human.timing.get` at the start of a long session.
2. After navigation, prefer `human.read` or `human.scan` before clicking again.
3. On repeated rapid `human.feedback` events or a sensitive page, call `human.timing.set` with a higher `consultSpeed` and longer minimums.
4. Call `human.antispam.check` after repeated searches, result pages, or unusual behavior.
5. If `blocked: true`, stop automation and hand off to a human. The bridge is not designed to bypass protections.

Full WebSocket example:

```json
{ "id": "t1", "type": "human.timing.set", "payload": { "consultSpeed": 1.8, "minFocusedMs": 4000 } }
{ "id": "r1", "type": "human.read", "payload": { "focused": true } }
{ "id": "a1", "type": "human.antispam.check", "payload": {} }
```

## Environment Variables

| Variable | Role | Default |
|---|---|---|
| `PORT` | HTTP/WS port | 8080 |
| `BRIDGE_HOST` | Bind host | 127.0.0.1 |
| `BRIDGE_URL` | WebSocket URL used by the TypeScript CLI | `ws://localhost:8080/ws/browser-bridge` |
| `BRIDGE_TOKEN` | WebSocket auth token, required outside localhost | empty, allowed locally |
| `BRIDGE_ADMIN_TOKEN` | Token for `exec.script` | empty = command disabled |
| `BRIDGE_ALLOW_EXEC_SCRIPT` | Enables `exec.script` when `1` | 0 |
| `BRIDGE_ALLOW_FILE_URLS` | Enables `file:` navigation when `1` | 0 |
| `BRIDGE_ALLOWED_FILE_ROOTS` | Comma-separated allowed roots for `file:` | empty |
| `CHROME_CHANNEL` | Playwright browser channel (`chrome`, `chromium`, `msedge`) | chrome |
| `CHROME_PROFILE` | Persistent Chromium/Chrome profile directory | empty = fresh context |
| `CHROME_CDP_URL` | CDP endpoint for connecting to an existing browser | empty |
| `BRIDGE_PLAYWRIGHT_SLOWMO_MS` | Slowdown applied to low-level Playwright actions | 0 |
| `BRIDGE_BRING_TO_FRONT` | Brings the active page to the front (`0` disables) | 1 |
| `BRIDGE_POLITE_MODE` | Per-domain slowdown and anti-bot detection (`0` disables) | 1 |
| `BRIDGE_POLITE_MIN_DELAY_MS` | Minimum delay between navigations to the same host | 12000 |
| `BRIDGE_AUTO_COOKIES` | Automatic handling of known cookie banners (`0` disables) | 1 |
| `BRIDGE_HUMAN_WARMUP` | Human movements and pauses after navigation (`0` disables) | 1 |
| `BRIDGE_PAGE_WARMUP_MS` | Human warmup duration after navigation | 2500 |
| `BRIDGE_HUMAN_CONSULT_SPEED` | Initial human consultation multiplier | `BRIDGE_DEMO_SPEED` or 1 |
| `BRIDGE_DEMO_SPEED` | General demonstration movement/pause multiplier | 1 |
| `BRIDGE_VISIBLE_CURSOR` | Shows the injected visual cursor (`0` disables) | 1 |
| `BRIDGE_ALLOWED_ORIGINS` | Comma-separated allowed origins | empty = all |
| `BRIDGE_DEFAULT_TIMEOUT_MS` | Default Playwright timeout | 15000 |
| `BRIDGE_DEFAULT_NAV_TIMEOUT_MS` | Default navigation timeout | 20000 |
| `BRIDGE_LOG_JSON` | JSON logs when `1` | 0 |
| `BRIDGE_LOG_LEVEL` | Minimum log level | info |
| `BRIDGE_MCP_ALLOW_RAW` | Exposes raw MCP tool `browser_command` when `1` | 0 |
