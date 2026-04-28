import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { HandlerContext, Handler } from './types.js';
import { controller, sessionStore } from '../controller.js';
import { validateUrl } from './validate.js';
import { traces } from '../traces.js';
import { politeGoto } from '../polite.js';

interface IncomingCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  url?: string;
  expires?: number;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

function validateCookies(input: unknown): IncomingCookie[] {
  if (!Array.isArray(input)) throw new Error('cookie.set: cookies must be an array');
  const out: IncomingCookie[] = [];
  for (const [i, raw] of input.entries()) {
    if (!raw || typeof raw !== 'object') throw new Error(`cookie.set[${i}]: cookie must be an object`);
    const c = raw as Record<string, unknown>;
    if (typeof c.name !== 'string' || !c.name) throw new Error(`cookie.set[${i}]: name required`);
    if (typeof c.value !== 'string') throw new Error(`cookie.set[${i}]: value must be a string`);
    if (!c.url && !c.domain) throw new Error(`cookie.set[${i}]: url or domain required`);
    if (c.url !== undefined && typeof c.url === 'string') validateUrl(c.url, 'cookie.set');
    if (c.sameSite !== undefined && !['Strict', 'Lax', 'None'].includes(c.sameSite as string)) {
      throw new Error(`cookie.set[${i}]: sameSite must be Strict|Lax|None`);
    }
    out.push(c as unknown as IncomingCookie);
  }
  return out;
}

export function sessionHandlers(ctx: HandlerContext): Record<string, Handler> {
  return {
    'session.create': async ({ sessionId, headless, profileDir }: any) => {
      await controller.launch({ headless, profileDir }, sessionId);
      return { sessionId, ok: true };
    },
    'session.list': async () => {
      return { sessions: controller.listSessions() };
    },
    'browser.status': async () => {
      try {
        const page = await ctx.p();
        return {
          ok: true,
          url: page.url(),
          title: await page.title().catch(() => ''),
          ready: true,
          sessionId: sessionStore.getStore()
        };
      } catch (e: any) {
        return { ok: false, error: e.message };
      }
    },
    'browser.close': async () => {
      await controller.close(sessionStore.getStore());
      return { ok: true };
    },
    'trace.list': async ({ sessionId }: any = {}) => {
      return { sessionId: sessionId ?? sessionStore.getStore() ?? 'default', events: traces.list(sessionId ?? sessionStore.getStore() ?? 'default') };
    },
    'trace.save': async ({ sessionId }: any = {}) => {
      return await traces.save(sessionId ?? sessionStore.getStore() ?? 'default');
    },
    'trace.artifacts': async () => {
      return { artifacts: await traces.artifacts() };
    },
    'screenshot': async ({ format = 'png', fullPage = false }: any = {}) => {
      const ext = format === 'jpg' || format === 'jpeg' ? 'jpg' : 'png';
      const page = await ctx.p();
      const dir = join(process.cwd(), 'logs', 'screenshots');
      await mkdir(dir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const sessionId = sessionStore.getStore() ?? 'default';
      const filename = `shot-${ts}-session-${sessionId}.${ext}`;
      const path = join(dir, filename);
      const buf = await page.screenshot({ path, type: ext === 'jpg' ? 'jpeg' : 'png', fullPage });
      const port = process.env.PORT ?? 8080;
      const imageUrl = `http://localhost:${port}/captures/${filename}`;
      return { path, imageUrl, dataUrl: `data:image/${ext};base64,${buf.toString('base64')}` };
    },
    'cookie.get': async ({ urls }: any = {}) => ({ cookies: await controller.ctx(sessionStore.getStore()).cookies(urls) }),
    'cookie.set': async ({ cookies }) => {
      const validated = validateCookies(cookies);
      await controller.ctx(sessionStore.getStore()).addCookies(validated as any);
      return { ok: true, count: validated.length };
    },
    'tab.list': async () => {
      const pages = controller.ctx(sessionStore.getStore()).pages();
      return {
        tabs: await Promise.all(
          pages.map(async (pg, i) => ({ index: i, url: pg.url(), title: await pg.title().catch(() => '') })),
        ),
      };
    },
    'tab.close': async ({ tabId, index }) => {
      const pages = controller.ctx(sessionStore.getStore()).pages();
      const idx = typeof tabId === 'number' ? tabId : index;
      const pg = pages[idx];
      if (!pg) throw new Error('tab not found');
      await pg.close();
      return { ok: true };
    },
    'tab.switch': async ({ index }) => {
      const pg = controller.ctx(sessionStore.getStore()).pages()[index];
      if (!pg) throw new Error('tab not found');
      controller.setActivePage(pg, sessionStore.getStore());
      await pg.bringToFront();
      return { url: pg.url() };
    },
    'tab.new': async ({ url }: any = {}) => {
      const safeUrl = url ? validateUrl(url, 'tab.new') : undefined;
      const pg = await controller.ctx(sessionStore.getStore()).newPage();
      controller.setActivePage(pg, sessionStore.getStore());
      if (safeUrl) await politeGoto(pg, safeUrl);
      return { url: pg.url() };
    },
    ping: async () => ({ pong: Date.now() }),
  };
}
