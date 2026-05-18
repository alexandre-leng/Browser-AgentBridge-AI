# OpenClaw Browser Bridge — Full Technical Reference

> **Version**: 3.2.2
> **Last Updated**: May 18, 2026

The OpenClaw Browser Bridge is a high-performance automation layer that bridges the gap between AI Agents and the Web. It focuses on **precision**, **human-like interaction**, and **structured data extraction**.

---

## 🧭 Core Concepts

### 1. Numerical Referencing (`ref`)
Instead of brittle CSS selectors or XPath, the bridge uses numerical IDs generated during the `annotate` phase. This allows an agent to see a screenshot with numbered boxes and simply say `click 7`.

### 2. Batch Execution (`run`)
To minimize WebSocket latency, multiple commands can be pipelined in a single `script.execute` call. 
- Example: `navigate → wait → annotate → extract`.

### 3. Human-in-the-Loop
The built-in **Live Viewer** (`/viewer`) allows humans to see what the agent is doing in real-time and even take manual control (Takeover mode) via mouse and keyboard.

### 4. Runtime Human Timing
Agents can tune consultation pauses while a session is running. This is useful when a site reacts badly to fast repeated scans or clicks: the agent can slow down `human.read`, `human.scan`, and `human.findText` without restarting the bridge.

The bridge emits `human.feedback` events during long consultations so clients can see progress and adapt before continuing.

---

## 🛠️ API Reference (WebSocket Commands)

All commands are sent as JSON over WebSocket to `/ws/browser-bridge`.

### 🤖 Agent Module (`agent.*`)
*High-level, humanized commands using numerical IDs.*

| Command | Payload | Description |
| :--- | :--- | :--- |
| `agent.click` | `{ref: number, double?: boolean, retry?: true}` | Moves mouse in a Bezier curve to the element and clicks. |
| `agent.type` | `{ref: number, text: string, clearFirst?: true}` | Focuses the element and types with realistic jitter. |
| `agent.press` | `{key: string, ref?: number}` | Presses a key (e.g., `Enter`, `Tab`). Auto-waits for navigation if `Enter`. |
| `agent.scroll` | `{direction: 'up'\|'down', amount?: number}` | Smoothly scrolls the viewport. |
| `agent.hover` | `{ref: number}` | Moves the mouse to hover over an element. |
| `agent.summary` | `{}` | Returns a text summary: URL, Title, interactive elements, elementCount. |
| `agent.search` | `{query: string, engine?: 'google'\|'bing'}` | Navigates to a search engine and extracts results. |

### 👁️ Vision Module (`page.*` & `vision.*`)
*Visual processing and element detection.*

| Command | Payload | Description |
| :--- | :--- | :--- |
| `page.annotate` | `{}` | Captures a screenshot with numbered overlays and returns the element tree. |
| `page.annotate` | `{noImage: true}` | Returns refs and metadata without embedding the screenshot payload. |
| `vision.start` | `{fps: number, annotate?: boolean}` | Starts a real-time frame stream (broadcasted to all clients). |
| `vision.stop` | `{}` | Stops the frame stream. |
| `screenshot` | `{format?: 'png'\|'jpg', fullPage?: boolean}` | Captures a standard screenshot. |

### 📊 Extraction Module (`dom.extract`)
*Transforms messy HTML into clean JSON.*

| Type | Description |
| :--- | :--- |
| `search-results` | Extrait titles, URLs, and snippets from search engines. |
| `form` | Lists all input fields, select boxes, and textareas with labels. |
| `table` | Parses tabular data into a 2D array. |
| `article` | Extracts the main title and text body (cleaning up ads/nav). |
| `google-maps` | Specialized extractor for local business listings and maps. |
| `listings` | Generic structured listing extractor for maps, directories, yellow pages, and result cards. |

`listings` returns:

```json
{
  "type": "listings",
  "listings": [
    {
      "name": "Ottho - Formation No Code et IA",
      "rating": 5,
      "reviews": 186,
      "address": "11 Rue Montgrand, Marseille",
      "phone": "07 57 59 77 84",
      "website": "https://...",
      "hours": "Ouvert · Ferme à 18:00",
      "summary": "..."
    }
  ]
}
```

### 🖱️ DOM Module (`dom.*`)
*Direct DOM manipulation using selectors (not recommended — prefer `agent.*` with refs).*

| Command | Payload | Description |
| :--- | :--- | :--- |
| `dom.click` | `{query?, selector?, text?}` | Clicks an element. |
| `dom.doubleClick` | `{query?, selector?, text?}` | Double-clicks an element. |
| `dom.press` | `{key, waitForNavigation?, timeout?: 10000}` | Presses a key. `waitForNavigation` defaults to `true` for Enter. |
| `dom.type` | `{query?, selector?, value?, text?}` | Types text into a field. |
| `dom.submit` | `{query?, selector?, timeout?: 10000}` | Submits a form (waits for navigation). |
| `dom.select` | `{query?, selector?, text?, value?}` | Selects an option in a `<select>` element. |
| `dom.hover` | `{query?, selector?, text?}` | Hovers over an element. |
| `dom.waitFor` | `{query?, selector?, text?, state?: 'visible'\|'hidden'\|'attached', timeout?: 10000}` | Waits for an element state. |
| `dom.html` | `{query?, selector?}` | Returns inner HTML. |
| `dom.inspect` | `{query?, selector?}` | Returns element tag, classes, attributes. |

---

### ⌨️ Raw Input Module (`input.*`)
*Low-latency primitives used by the Viewer for manual takeover.*

| Command | Payload | Description |
| :--- | :--- | :--- |
| `input.mouseMove` | `{x, y}` | Direct cursor jump (no humanization). |
| `input.mouseDown` | `{button}` | Mouse press. |
| `input.mouseUp` | `{button}` | Mouse release. |
| `input.text` | `{text}` | Instant text insertion (no jitter). |

### 🧑 Human Timing Module (`human.*`)
*Human-paced consultation and anti-spam feedback.*

| Command | Payload | Description |
| :--- | :--- | :--- |
| `human.read` | `{durationMs?: number, focused?: boolean}` | Reads the current page with text-size-based pauses. |
| `human.scan` | `{steps?: number, amount?: number, textFilter?: string, filterAny?: string[], filterLines?: boolean}` | Reads visible text, scrolls, and repeats with feedback. |
| `human.findText` | `{text: string, exact?: boolean, maxScrolls?: number, timeoutMs?: number, consultMs?: number}` | Searches visible text with a bounded timeout. |
| `human.clickText` | `{text: string, exact?: boolean, maxScrolls?: number, timeoutMs?: number}` | Finds visible text, clicks it, logs the stage, and falls back to `agent.click` when possible. |
| `human.timing.get` | `{}` | Returns the active consultation timing profile. |
| `human.timing.set` | `{consultSpeed?: number, minFocusedMs?: number, feedbackIntervalMs?: number, ...}` | Adjusts consultation timing live. |
| `human.timing.reset` | `{}` | Restores the default timing profile. |
| `human.antispam.check` | `{}` | Checks the page for known anti-bot text and returns `{blocked, warning?}` without throwing. |

Example:

```json
{ "id": "slow", "type": "human.timing.set", "payload": { "consultSpeed": 1.6, "minFocusedMs": 3500, "feedbackIntervalMs": 800 } }
```

Feedback event:

```json
{
  "type": "human.feedback",
  "payload": {
    "phase": "consulting",
    "reason": "human.scan.step.2",
    "remainingMs": 5200,
    "progress": 0.31
  }
}
```

Recommended agent behavior: slow down when pages are sensitive, run `human.antispam.check` after repeated search or scan actions, and stop for human handoff if `blocked` is true.

### MCP Surface

The stdio MCP server exposes focused tools for common agent workflows:

`browser_status`, `navigate`, `annotate_page`, `click_ref`, `type_ref`, `extract_schema`, `human_timing_get`, `human_timing_set`, `human_antispam_check`.

When `BRIDGE_MCP_ALLOW_RAW=1`, the server also exposes `browser_command` for low-level command dispatch. The MCP resource `api` (`openclaw://api`) returns the registered bridge command list, and the `browser_task` prompt provides a refs-first browser-task template.

---

## ⚙️ Configuration & Environment

The bridge can be configured via `.env` or environment variables:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | HTTP/WebSocket port. | `8080` |
| `BRIDGE_HOST` | Bind host. Non-local hosts require `BRIDGE_TOKEN`. | `127.0.0.1` |
| `BRIDGE_URL` | WebSocket URL used by the TypeScript CLI. | `ws://localhost:8080/ws/browser-bridge` |
| `BRIDGE_TOKEN` | WebSocket auth token. | empty for localhost |
| `BRIDGE_ALLOWED_ORIGINS` | CSV allowlist for WebSocket `Origin` headers. | any |
| `BRIDGE_ADMIN_TOKEN` | Token required by `exec.script` when enabled. | empty |
| `BRIDGE_ALLOW_EXEC_SCRIPT` | Enables arbitrary page JS eval when set to `1`. | `0` |
| `BRIDGE_ALLOW_FILE_URLS` | Enables `file:` navigation when set to `1`. | `0` |
| `BRIDGE_ALLOWED_FILE_ROOTS` | CSV allowlist for local file roots. | empty |
| `CHROME_CHANNEL` | Browser channel: `chrome`, `chromium`, or `msedge`. | `chrome` |
| `CHROME_PROFILE` | Persistent Chromium/Chrome profile directory. | empty |
| `CHROME_CDP_URL` | Existing browser CDP endpoint. | empty |
| `BRIDGE_PLAYWRIGHT_SLOWMO_MS` | Playwright slow motion in milliseconds. | `0` |
| `BRIDGE_BRING_TO_FRONT` | Bring the active page to front; `0` disables. | `1` |
| `BRIDGE_POLITE_MODE` | Domain pacing and anti-bot detection; `0` disables. | `1` |
| `BRIDGE_POLITE_MIN_DELAY_MS` | Minimum delay between navigations to the same host. | `12000` |
| `BRIDGE_AUTO_COOKIES` | Automatic handling for known cookie prompts; `0` disables. | `1` |
| `BRIDGE_HUMAN_WARMUP` | Human warmup after navigation; `0` disables. | `1` |
| `BRIDGE_PAGE_WARMUP_MS` | Human warmup duration after navigation. | `2500` |
| `BRIDGE_HUMAN_CONSULT_SPEED` | Initial multiplier for page consultation pauses. | `BRIDGE_DEMO_SPEED` or `1` |
| `BRIDGE_DEMO_SPEED` | General multiplier for demo movement/pause timing. | `1` |
| `BRIDGE_VISIBLE_CURSOR` | Injects a visible cursor overlay; `0` disables. | `1` |
| `BRIDGE_DEFAULT_TIMEOUT_MS` | Default Playwright timeout. | `15000` |
| `BRIDGE_DEFAULT_NAV_TIMEOUT_MS` | Default Playwright navigation timeout. | `20000` |
| `BRIDGE_LOG_JSON` | Emits logs as JSON when set to `1`. | `0` |
| `BRIDGE_HEADLESS` | Browser headless mode. `false` = visible browser window. | `true` |
| `BRIDGE_LOG_LEVEL` | Minimum log level: `debug`, `info`, `warn`, `error`. | `info` |
| `BRIDGE_MCP_ALLOW_RAW` | Exposes low-level MCP `browser_command` when set to `1`. | `0` |

---

## 🔒 Security & Performance

- **Rate Limiting**: Each WebSocket client is limited to 100 commands per minute to prevent accidental spamming.
- **Session Isolation**: Use `session.create` with `{sessionId, headless?, profileDir?}` to manage multiple independent browser contexts simultaneously.
- **Batch Execution**: Use `script.execute` or `batch` with `{commands, stopOnError?}` to pipeline multiple commands in a single round-trip.
- **Cookies**: `cookie.get({urls?})` and `cookie.set({cookies})` for state management across sessions.
- **Vision Diffing**: The vision stream uses MD5 hashing to only send frames when the page actually changes, saving bandwidth.

---

## 📁 File Structure

```text
src/
├── browser/
│   ├── handlers/       # Modular command logic
│   ├── agent.ts        # Annotation engine
│   ├── controller.ts   # Playwright lifecycle
│   ├── human.ts        # Interaction physics
│   ├── resolver.ts     # Element selector logic
│   └── vision.ts       # Frame streaming
├── transport/
│   └── ws.ts           # WebSocket/HTTP Server
├── cli/
│   └── bridge.ts       # CLI & REPL implementation
└── server.ts           # Application entry point
```

---

## 📄 License

This project is licensed under the MIT License. Built with ❤️ for the AI community.
