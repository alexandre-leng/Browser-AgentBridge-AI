---
name: openclaw-bridge
description: Pilot the OpenClaw Browser Bridge via WebSocket JSON-RPC — DOM-first browser automation with numerical grounding for AI agents.
version: 1.0.0
---

# 🦾 Skill: OpenClaw Browser Bridge

> **You are an AI agent with a browser.** This skill teaches you to see web pages, interact with them precisely, and extract data — all via a WebSocket bridge. No coordinate guessing. No HTML parsing. Just `id`-based interaction.

## 1. Identity & Endpoint

**What it is:** A headless Chromium browser controlled via JSON-RPC over WebSocket. The bridge gives you **numerical grounding**: every interactive element gets an `id` you can reference.

**Connect to:**
- WebSocket: `ws://localhost:8080/ws/browser-bridge`
- HTTP (health, captures, viewer): `http://localhost:8080`

**Authentication:**
- If `BRIDGE_TOKEN` is set on the server, send header `Authorization: Bearer <token>` on WS connect, or append `?token=<token>` to the WS URL.
- If no token is configured (default), connect freely.

**CLI shortcut (if local):** `bridge.cmd run "navigate URL" "annotate" "click 7"` — but as an AI, you speak JSON-RPC directly.

## 2. Protocol

### Request format
```json
{
  "id": "<string: any unique id>",
  "type": "<command.name>",
  "payload": { "key": "value" },
  "sessionId": "<optional: session name>"
}
```

### Response format — Success
```json
{
  "id": "<same id>",
  "ok": true,
  "result": { /* command-specific */ }
}
```

### Response format — Error
```json
{
  "id": "<same id>",
  "ok": false,
  "error": "human-readable message",
  "code": "ERROR_CODE"
}
```

### Examples
```json
// 1. Navigate
{"id":"1","type":"navigate","payload":{"url":"https://google.com"}}

// 2. Annotate (see the page)
{"id":"2","type":"page.annotate","payload":{}}

// 3. Batch (script.execute)
{"id":"3","type":"script.execute","payload":{
  "commands": [
    {"type":"navigate","payload":{"url":"https://google.com"}},
    {"type":"page.annotate","payload":{}},
    {"type":"agent.click","payload":{"ref":7}}
  ]
}}
```

## 3. Mental Loop (OBLIGATORY)

**Never interact blindly. Always follow this loop:**

```
1. ANNOTATE  →  page.annotate
   └─> Returns: screenshot URL + list of elements with {id, role, name, text}

2. REASON    →  Look at the screenshot visually, then find the id of the
                element you need in the JSON list.

3. ACT       →  agent.click {ref: N} / agent.type {ref: N, text: "..."}
                (Always use ref, never CSS selectors or coordinates)

4. VERIFY    →  agent.summary OR page.annotate again to confirm state changed
```

**Why this matters:** The page changes after every action. A `ref` from step 1 is **invalid** after navigation or DOM update. Re-annotate when in doubt.

## 4. Essential Commands (by Usage, not Prefix)

### 👁️ SEE — Understand the page
| Command | Purpose | Key Payload |
|---------|---------|-------------|
| `page.annotate` | **Start here.** Screenshot + numbered element list | `{}` |
| `agent.summary` | Lightweight: URL, title, top elements (no screenshot) | `{}` |
| `agent.tree` | Full ARIA accessibility tree (semantic roles) | `{}` |
| `vision.screenshot` | Raw screenshot as base64 (heavy) | `{}` |

### 🧭 NAVIGATE — Move around
| Command | Purpose | Key Payload |
|---------|---------|-------------|
| `navigate` | Go to URL | `{url: "https://..."}` |
| `agent.search` | Search Google/Bing directly | `{query: "...", engine: "google"}` |
| `tab.new` | Open new tab | `{url: "optional"}` |
| `tab.switch` | Switch to tab index | `{index: 0}` |
| `tab.close` | Close tab by index | `{index: 1}` |
| `agent.waitFor` | Wait for condition | `{for: "text\|url\|selector", value: "...", timeout: 5000}` |

### 🖱️ ACT — Interact with elements (always by `ref`)
| Command | Purpose | Key Payload |
|---------|---------|-------------|
| `agent.click` | Click element #N | `{ref: 7}` |
| `agent.type` | Focus, clear, type text | `{ref: 7, text: "hello", clear: true}` |
| `agent.hover` | Hover over element | `{ref: 7}` |
| `agent.press` | Press key (Enter, Tab, Escape) | `{key: "Enter"}` |
| `agent.scroll` | Scroll up/down | `{direction: "down\|up", amount: 300}` |
| `agent.select` | Select dropdown option | `{ref: 7, option: "Label"}` |

### 📊 EXTRACT — Get structured data (no parsing HTML)
| Command | Purpose | Key Payload |
|---------|---------|-------------|
| `dom.extract` | Smart extraction by type | `{type: "search-results\|form\|article\|table\|google-maps"}` |
| `dom.html` | Inner HTML of selector | `{selector: "body"}` |
| `dom.inspect` | Debug element by ref | `{ref: 7}` |

### 🔄 ORCHESTRATE — Batch & pipeline
| Command | Purpose | Key Payload |
|---------|---------|-------------|
| `script.execute` | **Run multiple commands in one WS message** | `{commands: [...], stopOnError: true}` |

**Interpolation in batch:** Reference previous step results with `${stepN.path}`:
```json
{"type":"agent.click","payload":{"ref":"${step1.result.elements[0].id}"}}
```

### 🔀 SESSION — Multi-browser isolation
| Command | Purpose |
|---------|---------|
| `session.create` | Create named browser context |
| `session.list` | List active sessions |

Send `"sessionId": "my-session"` in any request to target a specific session.

## 5. Security Rules & Limits

**You MUST enforce these. Never bypass.**

| Rule | Detail |
|------|--------|
| `exec.script` | **Requires `adminToken`** matching `BRIDGE_ADMIN_TOKEN` env var. If not set, command is **disabled**. Never attempt without token. |
| URLs | Only `http:`, `https:`, `about:`, `file:` allowed. **Refuse** `javascript:`, `data:`, etc. |
| Cookies | Structurally validated server-side. Don't forge. |
| Rate limit | 100 messages/minute per client. Batch with `script.execute` to stay under limit. |
| Origins | If `BRIDGE_ALLOWED_ORIGINS` is set, rejected if Origin header doesn't match. |

**Headers required if token active:**
```
Authorization: Bearer <BRIDGE_TOKEN>
```

## 6. Proven Patterns

### Pattern A: Google Search → Click First Result
```json
{"id":"1","type":"script.execute","payload":{
  "commands": [
    {"type":"agent.search","payload":{"query":"OpenClaw browser bridge"}},
    {"type":"agent.waitFor","payload":{"for":"text","value":"result"}},
    {"type":"page.annotate","payload":{}},
    {"type":"agent.click","payload":{"ref":1}}
  ]
}}
```

### Pattern B: Fill a Form (login, checkout, etc.)
```json
{"id":"2","type":"script.execute","payload":{
  "commands": [
    {"type":"page.annotate","payload":{}},
    {"type":"agent.type","payload":{"ref":3,"text":"user@example.com"}},
    {"type":"agent.type","payload":{"ref":5,"text":"password123"}},
    {"type":"agent.click","payload":{"ref":7}}
  ]
}}
```

### Pattern C: Extract Table Data
```json
{"id":"3","type":"dom.extract","payload":{"type":"table"}}
// Returns: { headers: [...], rows: [[...], [...]] }
```

### Pattern D: Resilient Batch (handles navigation delay)
```json
{"id":"4","type":"script.execute","payload":{
  "commands": [
    {"type":"navigate","payload":{"url":"https://site.com/page"}},
    {"type":"wait","payload":{}},
    {"type":"page.annotate","payload":{}}
  ]
}}
// Note: "wait" with empty payload waits for 'load' event (max 5s).
```

### Pattern E: Multi-Session Research
```json
{"id":"5","type":"session.create","payload":{"id":"research-1"}}
{"id":"6","type":"navigate","payload":{"url":"https://news.com"},"sessionId":"research-1"}
{"id":"7","type":"navigate","payload":{"url":"https://competitor.com"},"sessionId":"research-2"}
```

## 7. Common Errors & Recovery

| Error | Cause | Recovery |
|-------|-------|----------|
| `Element not found` | Page changed, `ref` is stale | Call `page.annotate` again, get new `ref` |
| `Element not found + suggestions` | Bridge suggests similar refs | Use the suggested `ref` if semantically correct |
| `Timeout` | Element didn't appear in time | Retry with `agent.waitFor` before action |
| `Navigation aborted` | Page redirect or popup blocker | Re-run `navigate` with full URL |
| `Protocol not allowed` | URL uses `javascript:` etc. | Use only `http/https/about/file` |
| `exec.script disabled` | `BRIDGE_ADMIN_TOKEN` not set | Ask human to set env var (never bypass) |

**Special case — `agent.press Enter`:** The server auto-detects navigation and waits for `domcontentloaded`. But if the next command in batch needs the new page, insert a `"wait"` step as shown in Pattern D.

## 8. Do / Don't

✅ **DO:**
- Always start with `page.annotate` on an unknown page
- Use `script.execute` for multi-step workflows (saves latency)
- Prefer `agent.summary` over `page.annotate` when you just need context, not visuals
- Use `dom.extract {type: "search-results"}` instead of parsing raw text
- Wait after navigation before re-annotating
- Use `sessionId` to isolate parallel tasks

❌ **DON'T:**
- Guess CSS selectors or coordinates — use `ref` from `annotate`
- Send commands one-by-one if they belong together — batch them
- Call `exec.script` without `adminToken`
- Trust a `ref` after navigation — always re-annotate
- Try to parse `vision.screenshot` as text — it's a base64 image

## 9. Meta: Self-Improvement Protocol

**As you use this skill, you learn.** At the end of every browsing session or task, you MUST reflect and propose updates.

### During the task
- Note every unexpected behavior (modal popup, cookie banner, dynamic iframe, etc.)
- Note which `ref` strategy worked or failed
- Record timing: how many steps, how many re-annotations needed

### At task end
Append a section to your response:

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

**Rules for proposing edits:**
- Never remove or weaken the **Security Rules** section without human approval
- Prefer adding to "Patterns" or "Errors" sections
- Keep the skill compact — if you add 10 lines, propose removing 5 obsolete ones
- The human decides whether to apply the diff

## 10. Complete Reference

For the exhaustive list of all 60 commands, their exact payloads, and return types, see:
- **`docs/api.md`** (auto-generated from source)

For the human-oriented workflow guide that inspired this skill:
- **`AGENT-GUIDE.md`**

For environment variables and security hardening:
- **`README.md`** § Security & Environment Variables

---

*Skill version: 1.0.0 | Bridge version: 3.1+ | Last updated: 2025-04-24*
