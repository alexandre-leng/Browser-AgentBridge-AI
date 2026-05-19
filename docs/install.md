# Install AgentBridge

> **Instruction pour agent :** Open docs/install.md and follow the steps to install the browser-agentbridge-ai package via npm, then start the bridge server.

## Via npm

```bash
npm install browser-agentbridge-ai
npx playwright install chromium
```

## Quick start

```bash
# Start the server
npx agentbridge start

# Or start with MCP mode
npx agentbridge mcp
```

## From source

```bash
git clone https://github.com/alexandre-leng/browser-agentbridge-ai.git
cd browser-agentbridge-ai
npm install
npm run build
npm start
```

## Requirements

- Node.js >= 18
- Chrome or Chromium installed

## Commands after install

| Command | Description |
|---|---|
| `agentbridge` | CLI to control the browser bridge |
| `bridge-check` | Health check for the bridge server |
