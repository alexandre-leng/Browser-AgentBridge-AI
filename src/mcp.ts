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
  name: 'agentbridge',
  version: VERSION,
});

server.registerTool('browser_status', {
  title: 'Browser status',
  description: 'Return the active AgentBridge browser session status.',
}, async () => {
  await ensureBrowser();
  return asText(await dispatch('browser.status', {}));
});

if (process.env.BRIDGE_MCP_ALLOW_RAW === '1') {
  server.registerTool('browser_command', {
    title: 'Run browser bridge command (raw)',
    description: 'Run any AgentBridge command by type and payload. Disabled by default; set BRIDGE_MCP_ALLOW_RAW=1 to enable.',
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

server.registerTool('inspect_forms', {
  title: 'Inspect forms',
  description: 'Map visible forms and fields on the active page, including labels, names, placeholders, types, selectors, and options.',
  inputSchema: {
    sessionId: z.string().optional(),
  },
}, async (args) => {
  await ensureBrowser();
  return asText(await dispatch('form.inspect', args));
});

server.registerTool('fill_form', {
  title: 'Fill form',
  description: 'Fill visible form fields by selector/query or by logical label/name. Works with text, textarea, select, checkbox, radio, and file inputs.',
  inputSchema: {
    values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).optional(),
    fields: z.array(z.object({
      query: z.string().optional(),
      selector: z.string().optional(),
      label: z.string().optional(),
      name: z.string().optional(),
      value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
    })).optional(),
    clearFirst: z.boolean().optional(),
    sessionId: z.string().optional(),
  },
}, async (args) => {
  await ensureBrowser();
  return asText(await dispatch('form.fill', args));
});

server.registerTool('submit_form', {
  title: 'Submit form',
  description: 'Submit the active form by clicking a submit/search button or pressing Enter.',
  inputSchema: {
    query: z.string().optional(),
    selector: z.string().optional(),
    timeout: z.number().optional(),
    sessionId: z.string().optional(),
  },
}, async (args) => {
  await ensureBrowser();
  return asText(await dispatch('form.submit', args));
});

server.registerTool('site_search', {
  title: 'Search current site',
  description: 'Find and use the current page search form. Useful for authenticated sites already opened in a persistent browser session.',
  inputSchema: {
    query: z.string().min(1),
    field: z.string().optional(),
    submit: z.string().optional(),
    timeout: z.number().optional(),
    sessionId: z.string().optional(),
  },
}, async (args) => {
  await ensureBrowser();
  return asText(await dispatch('form.search', args));
});

server.registerTool('web_search', {
  title: 'Search the web',
  description: 'Search Google, Bing, or DuckDuckGo, automatically paginate until the requested number of deduplicated results is collected, and return a run report.',
  inputSchema: {
    query: z.string().min(1),
    engine: z.enum(['google', 'bing', 'duckduckgo']).optional(),
    limit: z.number().min(1).max(100).optional(),
    pages: z.number().min(1).max(10).optional(),
    useForm: z.boolean().optional(),
    organicOnly: z.boolean().optional(),
    timeout: z.number().optional(),
    sessionId: z.string().optional(),
  },
}, async (args) => {
  await ensureBrowser();
  return asText(await dispatch('web.search', args));
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

server.registerTool('extract_marketplace', {
  title: 'Extract marketplace results',
  description: 'Extract marketplace/listing cards from the active page with title, price, location, category, delivery, sponsored flag, URL, image, and summary.',
  inputSchema: {
    limit: z.number().min(1).max(500).optional(),
    format: z.enum(['json', 'csv']).optional(),
    sessionId: z.string().optional(),
  },
}, async (args) => {
  await ensureBrowser();
  return asText(await dispatch('scrape.results', { ...args, type: 'marketplace' }));
});

server.registerTool('human_timing_get', {
  title: 'Get human timing profile',
  description: 'Return the current runtime human consultation timing profile.',
}, async () => {
  await ensureBrowser();
  return asText(await dispatch('human.timing.get', {}));
});

server.registerTool('human_timing_set', {
  title: 'Set human timing profile',
  description: 'Adjust runtime human consultation timings to slow down or speed up browsing behavior.',
  inputSchema: {
    consultSpeed: z.number().min(0.25).max(8).optional(),
    focusedWpmMin: z.number().min(80).max(500).optional(),
    focusedWpmMax: z.number().min(80).max(650).optional(),
    skimWpmMin: z.number().min(100).max(700).optional(),
    skimWpmMax: z.number().min(100).max(850).optional(),
    minFocusedMs: z.number().min(0).max(120000).optional(),
    maxFocusedMs: z.number().min(500).max(180000).optional(),
    minSkimMs: z.number().min(0).max(60000).optional(),
    maxSkimMs: z.number().min(500).max(120000).optional(),
    feedbackIntervalMs: z.number().min(250).max(10000).optional(),
  },
}, async (args) => {
  await ensureBrowser();
  return asText(await dispatch('human.timing.set', args));
});

server.registerTool('human_antispam_check', {
  title: 'Check anti-spam state',
  description: 'Inspect the current page for known anti-bot or anti-spam blocking text without throwing.',
}, async () => {
  await ensureBrowser();
  return asText(await dispatch('human.antispam.check', {}));
});

server.registerResource('api', 'agentbridge://api', {
  title: 'AgentBridge API',
  description: 'Registered AgentBridge command names.',
  mimeType: 'application/json',
}, async (uri) => ({
  contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(Object.keys(handlers).sort(), null, 2) }],
}));

server.registerPrompt('browser_task', {
  title: 'Browser task',
  description: 'Template for asking an agent to solve a browser task via AgentBridge refs.',
  argsSchema: { goal: z.string() },
}, ({ goal }) => ({
  messages: [{
    role: 'user',
    content: {
      type: 'text',
      text: `Use AgentBridge tools to complete this browser task. Prefer annotate_page, click_ref, type_ref, and extract_schema. Goal: ${goal}`,
    },
  }],
}));

await server.connect(new StdioServerTransport());
