# 🦾 AI Agent Guide for OpenClaw Bridge

> **Read this if you are an AI model (Claude, GPT, etc.) tasked with browsing the web.**

OpenClaw is designed to be your "Eyes and Hands" on the web. Unlike other tools that send you raw HTML (too many tokens) or raw screenshots (too hard to calculate coordinates), OpenClaw gives you **Numerical Grounding**.

---

## 👁️ Step 1: See the Page (`page.annotate`)
Your first step on any new page should always be `page.annotate`.
It returns:
1.  **A screenshot** (hosted at a URL).
2.  **A list of elements** like `{ "id": 7, "role": "button", "name": "Search" }`.

**Strategy:** Look at the screenshot to understand the layout, then find the `id` of the element you want to interact with in the JSON list.

---

## 🖱️ Step 2: Interact (`agent.click` / `agent.type`)
Instead of guessing a CSS selector, use the `ref` (the ID from Step 1).

-   **To click:** Use `agent.click { ref: 7 }`.
-   **To type:** Use `agent.type { ref: 7, text: "my search query" }`.

**Note:** `agent.type` automatically clears the field before typing. If you need to append, use the low-level `input.text`.

---

## ⚡ Step 3: Use Batching (`run`)
Don't send one command at a time. It's slow. Use the `run` command to pipeline your intent.

**Pro Workflow:**
```bash
# Efficiently navigate and prepare the page in one go
run "navigate https://github.com" "agent.waitFor --for text 'GitHub'" "page.annotate"
```

---

## 📊 Step 4: Extract Data (`dom.extract`)
Don't try to parse the entire page text. It's full of navigation links and ads. Use the specialized extractors:

-   `dom.extract { type: "search-results" }`: For Google/Bing.
-   `dom.extract { type: "form" }`: To see all input fields and their labels.
-   `dom.extract { type: "article" }`: To read a blog post or news item.

---

## 🛠️ Error Recovery
If a command fails with `Element not found`, don't panic. The bridge will return **Suggestions**.
- Example: `Element "7" not found. Did you mean: 8: Login, 9: Register?`

**Strategy:** If the page changed, simply call `page.annotate` again to refresh your numerical map.

---

## 🧭 Best Practices for Agents
1.  **Always `annotate`** before an interaction if you are unsure if the page has changed.
2.  **Wait for Navigation**: If you press Enter or click a link, wait 1-2 seconds or use `agent.waitFor` before calling `annotate`.
3.  **Use `agent.summary`**: If you just need to know "where am I?", `summary` gives you the URL, Title, and top elements without the heavy screenshot payload.
4.  **Trust the Human**: If you get stuck on a CAPTCHA or a complex login, ask the human to use the **Live Viewer** at `http://localhost:8080/viewer` to help you.

---

## 📋 Capabilities Matrix

| If you want to... | Use this command |
| :--- | :--- |
| Find clikable things | `page.annotate` |
| Search on Google | `agent.search { query: "..." }` |
| Read a long article | `dom.extract { type: "article" }` |
| Fill a complex form | `dom.extract { type: "form" }` then `agent.type` |
| Scroll through a feed | `agent.scroll { direction: "down" }` |

---

**Remember:** You have the precision of a surgeon. Use IDs, not guesses.
