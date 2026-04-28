#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { buildHandlers } from './browser/handlers/index.js';
import { controller, sessionStore } from './browser/controller.js';
import { VERSION } from './version.js';

const handlers: Record<string, any> = {};
const dispatch = async (type: string, payload: any = {}) => {
  const handler = handlers[type];
  if (!handler) throw new Error(`unknown command: ${type}`);
  const sessionId = payload?.sessionId;
  return sessionStore.run(sessionId, () => handler(payload));
};
Object.assign(handlers, buildHandlers(() => {}, dispatch));

async function ensureBrowser(headless = false) {
  if (!controller.isReady()) await controller.launch({ headless });
}

function asText(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

const server = new McpServer({
  name: 'openclaw-browser-bridge',
  version: VERSION,
});

server.registerTool('browser_status', {
  title: 'Browser status',
  description: 'Return the active OpenClaw browser session status.',
}, async () => {
  await ensureBrowser();
  return asText(await dispatch('browser.status', {}));
});

if (process.env.BRIDGE_MCP_ALLOW_RAW === '1') {
  server.registerTool('browser_command', {
    title: 'Run browser bridge command (raw)',
    description: 'Run any OpenClaw command by type and payload. Disabled by default; set BRIDGE_MCP_ALLOW_RAW=1 to enable.',
    inputSchema: {
      type: z.string().min(1),
      payload: z.record(z.string(), z.unknown()).optional(),
    },
  }, async ({ type, payload }) => {
    await ensureBrowser(Boolean(payload?.headless));
    return asText(await dispatch(type, payload ?? {}));
  });
}

server.registerTool('navigate', {
  title: 'Navigate',
  description: 'Navigate the active browser page to an http(s)/about URL.',
  inputSchema: {
    url: z.string().min(1),
    autoAnnotate: z.boolean().optional(),
    sessionId: z.string().optional(),
  },
}, async (args) => {
  await ensureBrowser();
  return asText(await dispatch('navigate', args));
});

server.registerTool('annotate_page', {
  title: 'Annotate page',
  description: 'Return interactive page elements with stable numeric refs and optional screenshot.',
  inputSchema: {
    noImage: z.boolean().optional(),
    sessionId: z.string().optional(),
  },
}, async (args) => {
  await ensureBrowser();
  return asText(await dispatch('page.annotate', args));
});

server.registerTool('click_ref', {
  title: 'Click element ref',
  description: 'Click an element from the latest annotation by numeric ref or fuzzy name.',
  inputSchema: {
    ref: z.union([z.number(), z.string()]),
    sessionId: z.string().optional(),
  },
}, async (args) => {
  await ensureBrowser();
  return asText(await dispatch('agent.click', args));
});

server.registerTool('type_ref', {
  title: 'Type into element ref',
  description: 'Type text into an element from the latest annotation.',
  inputSchema: {
    ref: z.union([z.number(), z.string()]),
    text: z.string(),
    clearFirst: z.boolean().optional(),
    sessionId: z.string().optional(),
  },
}, async (args) => {
  await ensureBrowser();
  return asText(await dispatch('agent.type', args));
});

server.registerTool('extract_schema', {
  title: 'Extract with schema',
  description: 'Extract structured data using CSS selectors from schema.fields.',
  inputSchema: {
    schema: z.object({ fields: z.record(z.string(), z.unknown()) }),
    llm: z.boolean().optional(),
    sessionId: z.string().optional(),
  },
}, async (args) => {
  await ensureBrowser();
  return asText(await dispatch('dom.extract', args));
});

server.registerResource('api', 'openclaw://api', {
  title: 'OpenClaw API',
  description: 'Registered OpenClaw command names.',
  mimeType: 'application/json',
}, async (uri) => ({
  contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(Object.keys(handlers).sort(), null, 2) }],
}));

server.registerPrompt('browser_task', {
  title: 'Browser task',
  description: 'Template for asking an agent to solve a browser task via OpenClaw refs.',
  argsSchema: { goal: z.string() },
}, ({ goal }) => ({
  messages: [{
    role: 'user',
    content: {
      type: 'text',
      text: `Use OpenClaw tools to complete this browser task. Prefer annotate_page, click_ref, type_ref, and extract_schema. Goal: ${goal}`,
    },
  }],
}));

await server.connect(new StdioServerTransport());
