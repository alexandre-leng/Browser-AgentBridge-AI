# OpenClaw Browser Bridge — Full Technical Reference

> **Version**: 3.1.0
> **Last Updated**: April 24, 2026

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

---

## 🛠️ API Reference (WebSocket Commands)

All commands are sent as JSON over WebSocket to `/ws/browser-bridge`.

### 🤖 Agent Module (`agent.*`)
*High-level, humanized commands using numerical IDs.*

| Command | Payload | Description |
| :--- | :--- | :--- |
| `agent.click` | `{ref: number, double?: boolean}` | Moves mouse in a Bezier curve to the element and clicks. |
| `agent.type` | `{ref: number, text: string, clearFirst?: boolean}` | Focuses the element and types with realistic jitter. |
| `agent.press` | `{key: string, ref?: number}` | Presses a key (e.g., `Enter`, `Tab`). Auto-waits for navigation if `Enter`. |
| `agent.scroll` | `{direction: 'up'\|'down', amount?: number}` | Smoothly scrolls the viewport. |
| `agent.hover` | `{ref: number}` | Moves the mouse to hover over an element. |
| `agent.summary` | `{}` | Returns a text summary: URL, Title, and top interactive elements. |
| `agent.search` | `{query: string, engine?: 'google'\|'bing'}` | Navigates to a search engine and extracts results. |

### 👁️ Vision Module (`page.*` & `vision.*`)
*Visual processing and element detection.*

| Command | Payload | Description |
| :--- | :--- | :--- |
| `page.annotate` | `{}` | Captures a screenshot with numbered overlays and returns the element tree. |
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

### ⌨️ Raw Input Module (`input.*`)
*Low-latency primitives used by the Viewer for manual takeover.*

| Command | Payload | Description |
| :--- | :--- | :--- |
| `input.mouseMove` | `{x, y}` | Direct cursor jump (no humanization). |
| `input.mouseDown` | `{button}` | Mouse press. |
| `input.mouseUp` | `{button}` | Mouse release. |
| `input.text` | `{text}` | Instant text insertion (no jitter). |

---

## ⚙️ Configuration & Environment

The bridge can be configured via `.env` or environment variables:

- `PORT`: Server port (default: `8080`).
- `CHROME_CHANNEL`: Browser to use (`chrome`, `chromium`, `msedge`).
- `CHROME_PROFILE`: Path to a persistent profile directory for auth persistence.
- `CHROME_CDP_URL`: Optional remote CDP endpoint to connect to an existing browser.

---

## 🔒 Security & Performance

- **Rate Limiting**: Each WebSocket client is limited to 100 commands per minute to prevent accidental spamming.
- **Session Isolation**: Use `sessionId` in payloads to manage multiple independent browser contexts simultaneously.
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
