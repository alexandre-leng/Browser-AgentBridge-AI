# 🤖 OpenClaw Browser Bridge — Agent Guide

This guide is designed for AI Agents (LLMs) to help them interact with the browser bridge efficiently and reliably.

---

## 🏎️ Performance Tip: Use the Batch "run" Command
Each command sent over WebSocket or CLI has overhead (latency, connection time). To minimize time, group your actions into a single `run` command.

**Example of a fast workflow:**
Instead of 5 separate calls, do:
`bridge run "navigate https://site.com" "annotate" "click 7" "type 7 text" "summary"`

---

## 👁️ Vision: The Annotate Workflow
Don't guess CSS selectors. Use the visual annotation system:

1.  **Annotate**: Call `page.annotate` or `bridge annotate`.
2.  **Analyze**: You will receive a list of elements with numeric IDs (`ref`).
3.  **Interact**: Use `agent.click {ref: N}` or `agent.type {ref: N, text: "..."}`.

**Why?** IDs are much more stable than CSS classes and handle IFrames automatically.

---

## 📄 Content Extraction: Save your Context Window
Sending the entire HTML of a page will consume too many tokens. Use structured extraction instead:

-   `agent.summary`: Get a high-level view (URL, Title, top interactive elements).
-   `dom.extract --type=article`: Get the main text content.
-   `dom.extract --type=search-results`: Get a clean JSON of search hits.
-   `dom.extract --type=table`: Get tabular data as JSON arrays.

---

## 🧭 Navigation & Waiting
Web pages are slow. The bridge helps you wait:

-   `agent.press "Enter"`: Automatically waits for navigation to complete.
-   `wait`: Without arguments, waits for the `load` event.
-   `agent.waitFor --for text "Success"`: Waits for a specific text to appear.

---

## 🛠️ Error Handling
If an interaction fails (e.g., `Element not found`), the bridge will return a list of **Available Elements** currently on the page. Use this list to find the correct ID if the page refreshed or shifted.

---

## 📝 Best Practices Checklist
- [ ] Group related commands in a `run` batch.
- [ ] Use `annotate` before clicking to ensure IDs are fresh.
- [ ] Use `summary` before doing deep extraction to confirm you are on the right page.
- [ ] Prefer `agent.*` commands (ref-based) over `dom.*` commands (selector-based).

---

*Happy browsing!*
