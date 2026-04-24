import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from 'playwright';
import { controller } from './controller.js';
import { resolve, resolveVisible } from './resolver.js';
import { humanMove, humanType, humanScroll, humanPause, sleep, rand, randInt } from './human.js';
import { vision } from './vision.js';
import { annotateInteractive, accessibilityTree, findByRef } from './agent.js';

type Handler = (payload: any) => Promise<any>;
type Broadcaster = (msg: any) => void;

const SEARCH_URLS: Record<string, (q: string) => string> = {
  google: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  bing: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
  duckduckgo: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
};

async function p(): Promise<Page> {
  return controller.page();
}

async function centerOf(page: Page, query: string) {
  const loc = await resolveVisible(page, query);
  const box = await loc.boundingBox();
  if (!box) throw new Error(`element has no bounding box: ${query}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, loc };
}

export function buildHandlers(broadcast: Broadcaster): Record<string, Handler> {
  return {
    // --- Navigation ---
    navigate: async ({ url, waitUntil = 'domcontentloaded' }) => {
      const page = await p();
      await page.goto(url, { waitUntil });
      return { url: page.url(), title: await page.title() };
    },

    search: async ({ engine = 'google', query }) => {
      const page = await p();
      const url = SEARCH_URLS[engine]?.(query);
      if (!url) throw new Error(`unknown engine: ${engine}`);
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      return { url: page.url(), title: await page.title() };
    },

    // --- DOM actions ---
    'dom.click': async ({ query, selector }) => {
      const page = await p();
      const q = query ?? selector;
      const { x, y } = await centerOf(page, q);
      await humanMove(page, x, y);
      await sleep(rand(50, 150));
      await page.mouse.click(x, y, { delay: randInt(40, 120) });
      return { clicked: q, x, y };
    },

    'dom.doubleClick': async ({ query, selector }) => {
      const page = await p();
      const { x, y } = await centerOf(page, query ?? selector);
      await humanMove(page, x, y);
      await page.mouse.dblclick(x, y);
      return { ok: true };
    },

    'dom.hover': async ({ query, selector }) => {
      const page = await p();
      const { x, y } = await centerOf(page, query ?? selector);
      await humanMove(page, x, y);
      return { x, y };
    },

    'dom.type': async ({ query, selector, value, text }) => {
      const page = await p();
      const q = query ?? selector;
      const val = value ?? text ?? '';
      if (q) {
        const loc = await resolveVisible(page, q);
        await loc.click();
        await humanPause(100, 300);
      }
      await humanType(page, val);
      return { typed: val.length };
    },

    'dom.press': async ({ key }) => {
      const page = await p();
      await page.keyboard.press(key);
      return { key };
    },

    'dom.select': async ({ query, selector, value }) => {
      const page = await p();
      const loc = await resolveVisible(page, query ?? selector);
      const res = await loc.selectOption(value);
      return { selected: res };
    },

    'dom.waitFor': async ({ query, selector, state = 'visible', timeout = 10000 }) => {
      const page = await p();
      await resolve(page, query ?? selector).waitFor({ state, timeout });
      return { ok: true };
    },

    'dom.extract': async () => {
      const page = await p();
      return { text: await page.evaluate(() => document.body.innerText) };
    },

    'dom.html': async ({ query, selector }: any = {}) => {
      const page = await p();
      if (query || selector) {
        const loc = resolve(page, query ?? selector);
        return { html: await loc.first().innerHTML() };
      }
      return { html: await page.content() };
    },

    'dom.search': async ({ text }) => {
      const page = await p();
      const locs = await page.getByText(text, { exact: false }).all();
      const hits = [];
      for (const loc of locs.slice(0, 20)) {
        const box = await loc.boundingBox().catch(() => null);
        if (box) hits.push({ text: (await loc.innerText()).trim().slice(0, 120), box });
      }
      return { hits };
    },

    'dom.inspect': async ({ query, selector }) => {
      const page = await p();
      const loc = resolve(page, query ?? selector).first();
      const info = await loc.evaluate((el: Element) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        return {
          tag: el.tagName,
          id: (el as HTMLElement).id,
          className: (el as HTMLElement).className,
          text: (el as HTMLElement).innerText?.slice(0, 200),
          box: { x: r.x, y: r.y, w: r.width, h: r.height },
        };
      });
      return info;
    },

    'dom.scrollDown': async ({ amount = 500 }: any = {}) => {
      await humanScroll(await p(), amount);
      return { ok: true };
    },
    'dom.scrollUp': async ({ amount = 500 }: any = {}) => {
      await humanScroll(await p(), -amount);
      return { ok: true };
    },

    'dom.fillForm': async ({ fields }) => {
      const page = await p();
      for (const { query, selector, value } of fields) {
        const loc = await resolveVisible(page, query ?? selector);
        await loc.click();
        await humanType(page, String(value));
        await humanPause(150, 400);
      }
      return { filled: fields.length };
    },

    'dom.submit': async ({ query, selector }: any = {}) => {
      const page = await p();
      if (query || selector) {
        const loc = await resolveVisible(page, query ?? selector);
        await loc.press('Enter');
      } else {
        await page.keyboard.press('Enter');
      }
      return { ok: true };
    },

    'dom.goto': async ({ url }) => {
      await (await p()).goto(url);
      return { ok: true };
    },

    // --- Raw mouse / keyboard ---
    'mouse.move': async ({ x, y }) => {
      await humanMove(await p(), x, y);
      return { x, y };
    },
    'mouse.click': async ({ x, y }) => {
      const page = await p();
      if (typeof x === 'number' && typeof y === 'number') {
        await humanMove(page, x, y);
        await page.mouse.click(x, y, { delay: randInt(40, 120) });
      } else {
        await page.mouse.down();
        await page.mouse.up();
      }
      return { ok: true };
    },
    'mouse.doubleClick': async ({ x, y }) => {
      const page = await p();
      await humanMove(page, x, y);
      await page.mouse.dblclick(x, y);
      return { ok: true };
    },
    'mouse.rightClick': async ({ x, y }) => {
      const page = await p();
      await humanMove(page, x, y);
      await page.mouse.click(x, y, { button: 'right' });
      return { ok: true };
    },
    'mouse.hover': async ({ x, y, query, selector }) => {
      const page = await p();
      if (query || selector) {
        const c = await centerOf(page, query ?? selector);
        await humanMove(page, c.x, c.y);
      } else {
        await humanMove(page, x, y);
      }
      return { ok: true };
    },
    'mouse.scroll': async ({ y = 0, x = 0 }) => {
      await humanScroll(await p(), y);
      void x;
      return { ok: true };
    },
    'mouse.clickOnText': async ({ text }) => {
      const page = await p();
      const loc = await resolveVisible(page, text);
      const box = await loc.boundingBox();
      if (!box) throw new Error('no box');
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await humanMove(page, x, y);
      await page.mouse.click(x, y, { delay: randInt(40, 120) });
      return { x, y };
    },

    'keyboard.type': async ({ text, value, query, selector }) => {
      const page = await p();
      const val = text ?? value ?? '';
      if (query || selector) {
        const loc = await resolveVisible(page, query ?? selector);
        await loc.click();
        await humanPause(100, 300);
      }
      await humanType(page, val);
      return { typed: val.length };
    },
    'keyboard.press': async ({ key }) => {
      await (await p()).keyboard.press(key);
      return { key };
    },

    // --- Screenshot ---
    screenshot: async ({ format = 'png', fullPage = false }: any = {}) => {
      const page = await p();
      const dir = join(process.cwd(), 'logs', 'screenshots');
      await mkdir(dir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const ext = format === 'jpeg' || format === 'jpg' ? 'jpg' : 'png';
      const path = join(dir, `${ts}.${ext}`);
      const buf = await page.screenshot({ path, type: ext === 'jpg' ? 'jpeg' : 'png', fullPage });
      return { path, dataUrl: `data:image/${ext};base64,${buf.toString('base64')}` };
    },

    // --- Vision stream ---
    'vision.start': async ({ fps = 2 }: any = {}) => {
      const page = await p();
      vision.start(page, fps, (b64, meta) => broadcast({ type: 'vision.frame', payload: { image: b64, ...meta } }));
      return { fps };
    },
    'vision.stop': async () => {
      vision.stop();
      return { ok: true };
    },
    'vision.screenshot': async () => {
      const page = await p();
      const buf = await page.screenshot({ type: 'jpeg', quality: 70 });
      return { image: buf.toString('base64') };
    },

    // --- Cookies ---
    'cookie.get': async ({ urls }: any = {}) => ({ cookies: await controller.ctx().cookies(urls) }),
    'cookie.set': async ({ cookies }) => {
      await controller.ctx().addCookies(cookies);
      return { ok: true };
    },

    // --- Tabs ---
    'tab.list': async () => {
      const pages = controller.ctx().pages();
      return {
        tabs: await Promise.all(
          pages.map(async (pg, i) => ({ index: i, url: pg.url(), title: await pg.title().catch(() => '') })),
        ),
      };
    },
    'tab.close': async ({ tabId, index }) => {
      const pages = controller.ctx().pages();
      const idx = typeof tabId === 'number' ? tabId : index;
      const pg = pages[idx];
      if (!pg) throw new Error('tab not found');
      await pg.close();
      return { ok: true };
    },
    'tab.switch': async ({ index }) => {
      const pg = controller.ctx().pages()[index];
      if (!pg) throw new Error('tab not found');
      controller.setActivePage(pg);
      await pg.bringToFront();
      return { url: pg.url() };
    },
    'tab.new': async ({ url }: any = {}) => {
      const pg = await controller.ctx().newPage();
      controller.setActivePage(pg);
      if (url) await pg.goto(url);
      return { url: pg.url() };
    },

    // --- Script execution ---
    'exec.script': async ({ code }) => {
      const page = await p();
      const result = await page.evaluate(new Function(`return (async () => { ${code} })()`) as any);
      return { result };
    },

    // --- Combos ---
    'combo.searchAndClick': async ({ query, engine = 'google' }) => {
      const page = await p();
      await page.goto(SEARCH_URLS[engine](query), { waitUntil: 'domcontentloaded' });
      await humanPause(600, 1200);
      const firstResult = page.locator('a h3').first();
      await firstResult.waitFor({ state: 'visible', timeout: 8000 });
      const box = await firstResult.boundingBox();
      if (!box) throw new Error('no result');
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await humanMove(page, x, y);
      await page.mouse.click(x, y);
      return { clicked: query };
    },

    // --- Human behavior ---
    'human.read': async ({ durationMs = 4000 }: any = {}) => {
      const page = await p();
      const end = Date.now() + durationMs;
      while (Date.now() < end) {
        await humanScroll(page, randInt(80, 250));
        await humanPause(600, 1600);
      }
      return { ok: true };
    },
    'human.explore': async ({ steps = 3 }: any = {}) => {
      const page = await p();
      for (let i = 0; i < steps; i++) {
        const vp = page.viewportSize() ?? { width: 1280, height: 800 };
        await humanMove(page, randInt(50, vp.width - 50), randInt(50, vp.height - 50));
        await humanPause(300, 900);
      }
      return { ok: true };
    },

    // --- Agent-friendly API (style Antigravity) ---

    // Returns an annotated screenshot with numbered interactive elements + their metadata.
    // The agent should call this first to "see" the page, then use agent.click {ref: N}.
    'page.annotate': async () => {
      const page = await p();
      const { elements, imageB64 } = await annotateInteractive(page);
      return { image: imageB64, elements, url: page.url(), title: await page.title() };
    },

    // Compact accessibility tree (role + name, no bounding boxes).
    'page.snapshot': async () => {
      const page = await p();
      const tree = await accessibilityTree(page);
      return { url: page.url(), title: await page.title(), tree };
    },

    // Click by element ref: number (from last page.annotate) or natural description string.
    // Falls back to semantic resolver if ref is a string not found in cache.
    'agent.click': async ({ ref, double = false }) => {
      const page = await p();
      const el = findByRef(ref);
      if (el) {
        const x = el.box.x + Math.round(el.box.w / 2);
        const y = el.box.y + Math.round(el.box.h / 2);
        await humanMove(page, x, y);
        await sleep(rand(50, 130));
        if (double) {
          await page.mouse.dblclick(x, y);
        } else {
          await page.mouse.click(x, y, { delay: randInt(40, 110) });
        }
        return { clicked: el.name || el.role, ref, x, y };
      }
      if (typeof ref === 'string') {
        const { x, y } = await centerOf(page, ref);
        await humanMove(page, x, y);
        await sleep(rand(50, 130));
        await page.mouse.click(x, y, { delay: randInt(40, 110) });
        return { clicked: ref, x, y };
      }
      throw new Error(`agent.click: element not found — ref: ${ref}`);
    },

    // Type text into an element identified by ref (number or description).
    // Clears existing content first if clearFirst is true (default).
    'agent.type': async ({ ref, text, clearFirst = true }) => {
      const page = await p();
      const val = String(text ?? '');
      const el = findByRef(ref);
      if (el) {
        const x = el.box.x + Math.round(el.box.w / 2);
        const y = el.box.y + Math.round(el.box.h / 2);
        await humanMove(page, x, y);
        await page.mouse.click(x, y, { delay: randInt(30, 80) });
        await humanPause(80, 200);
        if (clearFirst) {
          await page.keyboard.press('Control+a');
          await sleep(rand(30, 80));
          await page.keyboard.press('Delete');
          await sleep(rand(30, 60));
        }
        await humanType(page, val);
        return { typed: val.length, ref };
      }
      if (typeof ref === 'string') {
        const loc = await resolveVisible(page, ref);
        await loc.click();
        await humanPause(80, 200);
        if (clearFirst) await loc.fill('');
        await humanType(page, val);
        return { typed: val.length };
      }
      throw new Error(`agent.type: element not found — ref: ${ref}`);
    },

    // Press a key (Enter, Tab, Escape, ArrowDown, …) optionally on a focused element.
    'agent.press': async ({ key, ref }: any) => {
      const page = await p();
      if (ref !== undefined) {
        const el = findByRef(ref);
        if (el) {
          const x = el.box.x + Math.round(el.box.w / 2);
          const y = el.box.y + Math.round(el.box.h / 2);
          await page.mouse.click(x, y);
          await sleep(rand(30, 80));
        }
      }
      await page.keyboard.press(String(key));
      return { key };
    },

    // Scroll the viewport. direction: 'down'|'up'|'left'|'right', amount in px.
    'agent.scroll': async ({ direction = 'down', amount = 600 }: any) => {
      const page = await p();
      const dy = direction === 'up' ? -Math.abs(amount) : direction === 'down' ? Math.abs(amount) : 0;
      const dx = direction === 'left' ? -Math.abs(amount) : direction === 'right' ? Math.abs(amount) : 0;
      await humanScroll(page, dy || dx);
      return { ok: true };
    },

    // Wait until a visible text or a URL pattern appears (for navigation feedback).
    'agent.waitFor': async ({ text, url, timeout = 12000 }: any) => {
      const page = await p();
      if (url) {
        await page.waitForURL(url instanceof RegExp ? url : new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), {
          timeout,
        });
      } else if (text) {
        await page.getByText(String(text), { exact: false }).first().waitFor({ state: 'visible', timeout });
      } else {
        await page.waitForLoadState('domcontentloaded');
      }
      return { url: page.url(), title: await page.title() };
    },

    // Hover over an element (useful before annotating dynamic menus).
    'agent.hover': async ({ ref }: any) => {
      const page = await p();
      const el = findByRef(ref);
      if (el) {
        const x = el.box.x + Math.round(el.box.w / 2);
        const y = el.box.y + Math.round(el.box.h / 2);
        await humanMove(page, x, y);
        return { hovered: el.name || el.role };
      }
      if (typeof ref === 'string') {
        const { x, y } = await centerOf(page, ref);
        await humanMove(page, x, y);
        return { hovered: ref };
      }
      throw new Error(`agent.hover: element not found — ref: ${ref}`);
    },

    // Select an option in a <select> by visible text or value.
    'agent.select': async ({ ref, option }: any) => {
      const page = await p();
      const el = findByRef(ref);
      let loc;
      if (el) {
        loc = page.locator(`${el.tag}`, { hasText: el.name }).or(page.locator(`[aria-label="${el.name}"]`)).first();
      } else if (typeof ref === 'string') {
        loc = await resolveVisible(page, ref);
      } else {
        throw new Error(`agent.select: element not found — ref: ${ref}`);
      }
      const selected = await loc.selectOption(String(option));
      return { selected };
    },

    // Raw input (viewer takeover: no humanization, minimum latency) ---
    'input.mouseMove': async ({ x, y }) => {
      await (await p()).mouse.move(x, y);
      return { ok: true };
    },
    'input.mouseDown': async ({ x, y, button = 'left' }) => {
      const page = await p();
      if (typeof x === 'number' && typeof y === 'number') await page.mouse.move(x, y);
      await page.mouse.down({ button });
      return { ok: true };
    },
    'input.mouseUp': async ({ x, y, button = 'left' }) => {
      const page = await p();
      if (typeof x === 'number' && typeof y === 'number') await page.mouse.move(x, y);
      await page.mouse.up({ button });
      return { ok: true };
    },
    'input.wheel': async ({ x, y, deltaX = 0, deltaY = 0 }) => {
      const page = await p();
      if (typeof x === 'number' && typeof y === 'number') await page.mouse.move(x, y);
      await page.mouse.wheel(deltaX, deltaY);
      return { ok: true };
    },
    'input.keyDown': async ({ key }) => {
      await (await p()).keyboard.down(key);
      return { ok: true };
    },
    'input.keyUp': async ({ key }) => {
      await (await p()).keyboard.up(key);
      return { ok: true };
    },
    'input.text': async ({ text }) => {
      await (await p()).keyboard.insertText(String(text ?? ''));
      return { ok: true };
    },
    'input.focus': async () => {
      const page = await p();
      await page.bringToFront();
      return { ok: true };
    },
    'viewport.set': async ({ width, height }) => {
      const page = await p();
      const w = Math.max(320, Math.min(4096, Math.round(width)));
      const h = Math.max(240, Math.min(4096, Math.round(height)));
      await page.setViewportSize({ width: w, height: h }).catch(() => {});
      return { width: w, height: h };
    },

    // --- Lifecycle ---
    'browser.close': async () => {
      await controller.close();
      return { ok: true };
    },
    ping: async () => ({ pong: Date.now() }),
  };
}
