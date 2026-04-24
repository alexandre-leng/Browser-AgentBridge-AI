import type { Page } from 'playwright';
import type { HandlerContext, Handler } from './types.js';
import { humanMove, humanScroll, humanPause, sleep, randInt } from '../human.js';
import { SEARCH_URLS } from './navigation.js';
import { validate } from './validate.js';
import { extractFrenchPhones } from './phone.js';

const COOKIE_SELECTORS = [
  '#L2AGLb', // Google
  'button:has-text("Tout accepter")',
  'button:has-text("Accept all")',
  'button:has-text("I accept")',
  'button:has-text("Accorder")',
  'button:has-text("Autoriser")',
  'button:has-text("Accepter")',
  '#accept-cookies',
  '[aria-label*="Accepter"]',
  '[aria-label*="Accept all"]'
];

async function autoAcceptCookies(page: Page) {
  for (const sel of COOKIE_SELECTORS) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 1000 })) {
        await btn.click();
        await sleep(500);
        return true;
      }
    } catch { /* ignore */ }
  }
  return false;
}

export function specialHandlers(ctx: HandlerContext): Record<string, Handler> {
  return {
    // --- Scripts ---
    'script.execute': async (payload: any) => {
      validate(payload, {
        commands: { type: 'array', required: true, min: 1 },
        stopOnError: { type: 'boolean' },
        returnAllResults: { type: 'boolean' },
      }, 'script.execute');
      const { commands, stopOnError = true, returnAllResults = false } = payload;
      if (!ctx.dispatch) throw new Error('dispatch not available');
      const allResults = [];
      let finalResult = null;
      let step = 0;
      const t0 = Date.now();
      
      const resolveVars = (obj: any, context: any): any => {
        if (typeof obj === 'string') {
          return obj.replace(/\$\{step(\d+)\.([^}]+)\}/g, (_, stepIdx, path) => {
            const res = context[Number(stepIdx)];
            if (!res) return _;
            let val = res.result;
            for (const p of path.split(/[.\[\]]+/).filter(Boolean)) {
              if (val === undefined || val === null) break;
              val = val[p];
            }
            return val ?? _;
          });
        }
        if (Array.isArray(obj)) return obj.map(v => resolveVars(v, context));
        if (obj && typeof obj === 'object') {
          const res: any = {};
          for (const [k, v] of Object.entries(obj)) res[k] = resolveVars(v, context);
          return res;
        }
        return obj;
      };

      for (const cmd of commands) {
        try {
          const payload = resolveVars(cmd.payload ?? {}, allResults);
          finalResult = await ctx.dispatch(cmd.type, payload);
          allResults.push({ step, type: cmd.type, result: finalResult });
        } catch (err: any) {
          if (stopOnError) throw new Error(`Script failed at step ${step} (${cmd.type}): ${err.message}`);
          allResults.push({ step, type: cmd.type, error: err.message });
        }
        step++;
      }
      return {
        finalResult,
        ...(returnAllResults ? { allResults } : {}),
        durationMs: Date.now() - t0,
        stepsExecuted: step
      };
    },

    'wait': async ({ ms }: any) => {
      const page = await ctx.p();
      if (!ms) {
        await page.waitForLoadState('load', { timeout: 5000 }).catch(() => {});
        return { waited: 'load' };
      }
      await sleep(Number(ms));
      return { ok: true, waited: ms };
    },

    'exec.script': async ({ code, adminToken }: any) => {
      const expected = process.env.BRIDGE_ADMIN_TOKEN;
      if (!expected) throw new Error('exec.script disabled: set BRIDGE_ADMIN_TOKEN to enable');
      if (adminToken !== expected) throw new Error('exec.script: invalid admin token');
      if (typeof code !== 'string') throw new Error('exec.script: code must be a string');
      const page = await ctx.p();
      const result = await page.evaluate((c: string) => {
         
        return new Function(`return (async () => { ${c} })()`)();
      }, code);
      return { result };
    },

    // --- Combos ---
    'combo.searchAndClick': async ({ query, engine = 'google' }) => {
      const page = await ctx.p();
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

    'agent.search': async ({ query, engine = 'google' }: any) => {
      const page = await ctx.p();
      await page.goto(SEARCH_URLS[engine](query), { waitUntil: 'domcontentloaded' });
      await humanPause(1000, 2000);
      const results = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('h3')).map(h => ({
          title: h.innerText,
          url: h.closest('a')?.href || h.parentElement?.querySelector('a')?.href,
          snippet: h.parentElement?.innerText?.slice(0, 300)
        })).filter(x => x.title && x.url).slice(0, 10);
      });
      return { query, results, url: page.url() };
    },

    'agent.task': async ({ goal, engine = 'google' }: any) => {
      const page = await ctx.p();
      
      // 1. Navigation
      await page.goto(SEARCH_URLS[engine](goal), { waitUntil: 'domcontentloaded' });
      
      // 2. Auto-cookie
      const cookiesAccepted = await autoAcceptCookies(page);
      
      // 3. Wait for results
      await humanPause(1000, 2000);
      
      // 4. Try extract maps/local first
      const candidates = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('[data-result-id], .VwiC3b')).map(el => ({
          title: el.querySelector('h3, .OSrXXb')?.textContent ?? '',
          text: el.textContent ?? '',
        }));
      });
      const mapsData = candidates.flatMap((c) => {
        const phones = extractFrenchPhones(c.text);
        return phones.length ? [{ title: c.title, phone: phones[0] }] : [];
      });
      
      // 5. Normal search results
      const searchData = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('h3')).map(h => ({
          title: h.innerText,
          url: h.closest('a')?.href
        })).filter(x => x.title && x.url).slice(0, 5);
      });

      return { 
        goal, 
        cookiesAccepted, 
        localResults: mapsData, 
        webResults: searchData,
        summary: `Found ${mapsData.length} local results and ${searchData.length} web results.`
      };
    },

    // --- Human behavior ---
    'human.read': async ({ durationMs = 4000 }: any = {}) => {
      const page = await ctx.p();
      const end = Date.now() + durationMs;
      while (Date.now() < end) {
        await humanScroll(page, randInt(80, 250));
        await humanPause(600, 1600);
      }
      return { 
        ok: true, 
        text: await page.evaluate(() => document.body.innerText),
        url: page.url(),
        title: await page.title()
      };
    },
    'human.explore': async ({ steps = 3 }: any = {}) => {
      const page = await ctx.p();
      for (let i = 0; i < steps; i++) {
        const vp = page.viewportSize() ?? { width: 1280, height: 800 };
        await humanMove(page, randInt(50, vp.width - 50), randInt(50, vp.height - 50));
        await humanPause(300, 900);
      }
      return { ok: true };
    },

    // --- Vision ---
    'vision.start': async ({ fps = 2, annotate = false }: any = {}) => {
      const { vision } = await import('../vision.js');
      const page = await ctx.p();
      vision.start(page, fps, (b64, meta) => ctx.broadcast({ type: 'vision.frame', payload: { image: b64, ...meta } }), { annotate });
      return { fps, annotate };
    },
    'vision.stop': async () => {
      const { vision } = await import('../vision.js');
      vision.stop();
      return { ok: true };
    },
    'vision.screenshot': async () => {
      const page = await ctx.p();
      const buf = await page.screenshot({ type: 'jpeg', quality: 70 });
      return { image: buf.toString('base64') };
    },
  };
}
