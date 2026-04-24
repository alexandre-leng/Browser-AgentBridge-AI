import type { Page } from 'playwright';
import type { HandlerContext, Handler } from './types.js';
import { resolve, resolveVisible } from '../resolver.js';
import { humanMove, humanType, humanScroll, humanPause, sleep, rand, randInt } from '../human.js';

async function centerOf(page: Page, query: string) {
  const loc = await resolveVisible(page, query);
  const box = await loc.boundingBox();
  if (!box) throw new Error(`element has no bounding box: ${query}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, loc };
}

export function domHandlers(ctx: HandlerContext): Record<string, Handler> {
  return {
    'dom.click': async ({ query, selector, text }) => {
      const page = await ctx.p();
      const q = query ?? selector ?? text;
      const { x, y } = await centerOf(page, q);
      await humanMove(page, x, y);
      await sleep(rand(50, 150));
      await page.mouse.click(x, y, { delay: randInt(40, 120) });
      return { clicked: q, x, y };
    },

    'dom.doubleClick': async ({ query, selector, text }) => {
      const page = await ctx.p();
      const { x, y } = await centerOf(page, query ?? selector ?? text);
      await humanMove(page, x, y);
      await page.mouse.dblclick(x, y);
      return { ok: true };
    },

    'dom.hover': async ({ query, selector, text }) => {
      const page = await ctx.p();
      const { x, y } = await centerOf(page, query ?? selector ?? text);
      await humanMove(page, x, y);
      return { x, y };
    },

    'dom.type': async ({ query, selector, value, text }) => {
      const page = await ctx.p();
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

    'dom.press': async ({ key, waitForNavigation, timeout = 10000 }: any) => {
      const page = await ctx.p();
      const shouldWait = waitForNavigation ?? (key === 'Enter');
      if (shouldWait) {
        const navPromise = page.waitForLoadState('domcontentloaded', { timeout }).catch(() => {});
        await page.keyboard.press(key);
        await navPromise;
      } else {
        await page.keyboard.press(key);
      }
      return { key, waitedForNavigation: shouldWait };
    },

    'dom.submit': async ({ query, selector, timeout = 10000 }: any = {}) => {
      const page = await ctx.p();
      const navPromise = page.waitForLoadState('domcontentloaded', { timeout }).catch(() => {});
      if (query || selector) {
        const loc = await resolveVisible(page, query ?? selector);
        await loc.press('Enter');
      } else {
        await page.keyboard.press('Enter');
      }
      await navPromise;
      return { ok: true };
    },

    'dom.select': async ({ query, selector, text, value }) => {
      const page = await ctx.p();
      const loc = await resolveVisible(page, query ?? selector ?? text);
      const res = await loc.selectOption(value);
      return { selected: res };
    },

    'dom.waitFor': async ({ query, selector, text, state = 'visible', timeout = 10000 }) => {
      const page = await ctx.p();
      await resolve(page, query ?? selector ?? text).waitFor({ state, timeout });
      return { ok: true };
    },

    'dom.html': async ({ query, selector }: any = {}) => {
      const page = await ctx.p();
      if (query || selector) {
        const loc = resolve(page, query ?? selector);
        return { html: await loc.first().innerHTML() };
      }
      return { html: await page.content() };
    },

    'dom.search': async ({ text }) => {
      const page = await ctx.p();
      const locs = await page.getByText(text, { exact: false }).all();
      const hits = [];
      for (const loc of locs.slice(0, 20)) {
        const box = await loc.boundingBox().catch(() => null);
        if (box) hits.push({ text: (await loc.innerText()).trim().slice(0, 120), box });
      }
      return { hits };
    },

    'dom.inspect': async ({ query, selector }) => {
      const page = await ctx.p();
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
      await humanScroll(await ctx.p(), amount);
      return { ok: true };
    },
    'dom.scrollUp': async ({ amount = 500 }: any = {}) => {
      await humanScroll(await ctx.p(), -amount);
      return { ok: true };
    },

    'dom.fillForm': async ({ fields }) => {
      const page = await ctx.p();
      for (const { query, selector, text, value } of fields) {
        const loc = await resolveVisible(page, query ?? selector ?? text);
        await loc.click();
        await humanType(page, String(value));
        await humanPause(150, 400);
      }
      return { filled: fields.length };
    },

  };
}
