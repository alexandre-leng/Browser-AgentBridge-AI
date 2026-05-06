import type { Page } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { HandlerContext, Handler } from './types.js';
import {
  flashClick,
  getHumanTimingProfile,
  humanConsult,
  humanIdle,
  humanJitter,
  humanMove,
  humanPause,
  humanPreClick,
  humanScroll,
  humanSkim,
  resetHumanTimingProfile,
  sleep,
  randInt,
  updateHumanTimingProfile,
} from '../human.js';
import { SEARCH_URLS } from './navigation.js';
import { validate } from './validate.js';
import { extractFrenchPhones } from './phone.js';
import { assertExecAllowed } from '../security.js';
import { politeGoto, assertNoAntiBot } from '../polite.js';
import { annotateInteractive, getAgentElements } from '../agent.js';

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

function humanFeedback(ctx: HandlerContext, event: Record<string, unknown>) {
  ctx.broadcast({ type: 'human.feedback', payload: { t: Date.now(), ...event } });
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
      const { commands, stopOnError = true, returnAllResults = true } = payload;
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

    /**
     * Lightweight batch — execute N commands in a single WS round-trip.
     *
     * Cheaper than `script.execute` (no schema validation, no `${stepN.path}`
     * variable interpolation, no rate-limit lookup per command). Use this for
     * fast scraping pipelines where each command is independent. Use
     * `script.execute` when you need to chain results between steps.
     */
    'batch': async ({ commands, stopOnError = false }: any) => {
      if (!Array.isArray(commands) || commands.length === 0) {
        throw new Error('batch: `commands` must be a non-empty array');
      }
      if (!ctx.dispatch) throw new Error('batch: dispatch not available');
      const t0 = Date.now();
      const results: any[] = [];
      for (let i = 0; i < commands.length; i++) {
        const cmd = commands[i];
        if (!cmd?.type || typeof cmd.type !== 'string') {
          results.push({ step: i, ok: false, error: 'missing or invalid `type`' });
          if (stopOnError) break;
          continue;
        }
        try {
          const result = await ctx.dispatch(cmd.type, cmd.payload ?? {});
          results.push({ step: i, ok: true, type: cmd.type, result });
        } catch (err: any) {
          results.push({ step: i, ok: false, type: cmd.type, error: err?.message ?? String(err) });
          if (stopOnError) break;
        }
      }
      return { results, durationMs: Date.now() - t0, stepsExecuted: results.length };
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
      assertExecAllowed(adminToken);
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
      await politeGoto(page, SEARCH_URLS[engine](query), { waitUntil: 'domcontentloaded' });
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
      await politeGoto(page, SEARCH_URLS[engine](query), { waitUntil: 'domcontentloaded' });
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
      await politeGoto(page, SEARCH_URLS[engine](goal), { waitUntil: 'domcontentloaded' });
      await assertNoAntiBot(page);
      
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
    'human.timing.get': async () => {
      return { ok: true, timing: getHumanTimingProfile() };
    },

    'human.timing.set': async (payload: any = {}) => {
      const timing = updateHumanTimingProfile(payload);
      humanFeedback(ctx, { phase: 'timing.updated', timing });
      return { ok: true, timing };
    },

    'human.timing.reset': async () => {
      const timing = resetHumanTimingProfile();
      humanFeedback(ctx, { phase: 'timing.reset', timing });
      return { ok: true, timing };
    },

    'human.antispam.check': async () => {
      const page = await ctx.p();
      try {
        await assertNoAntiBot(page);
        const result = { ok: true, blocked: false, url: page.url(), title: await page.title() };
        humanFeedback(ctx, { phase: 'antispam.ok', ...result });
        return result;
      } catch (err: any) {
        const result = { ok: true, blocked: true, warning: err.message, url: page.url(), title: await page.title() };
        humanFeedback(ctx, { phase: 'antispam.warning', ...result });
        return result;
      }
    },

    'human.read': async ({ durationMs, focused = true }: any = {}) => {
      const page = await ctx.p();
      const text = await page.evaluate(() => document.body.innerText);
      const requestedDuration = Number(durationMs);
      const safeDuration = durationMs === undefined || !Number.isFinite(requestedDuration)
        ? await humanConsult(page, text, {
            focused: Boolean(focused),
            reason: 'human.read',
            onFeedback: (event) => humanFeedback(ctx, event),
          })
        : Math.max(0, requestedDuration);
      if (durationMs !== undefined && Number.isFinite(requestedDuration)) {
        const end = Date.now() + safeDuration;
        while (Date.now() < end) {
          humanFeedback(ctx, {
            phase: 'consulting',
            reason: 'human.read.override',
            remainingMs: Math.max(0, end - Date.now()),
            timing: getHumanTimingProfile(),
          });
          await humanScroll(page, randInt(70, 220));
          await humanPause(900, 2400);
        }
      }
      return { 
        ok: true, 
        durationMs: safeDuration,
        text,
        url: page.url(),
        title: await page.title()
      };
    },
    'human.explore': async ({ steps = 3, scroll = false }: any = {}) => {
      const page = await ctx.p();
      for (let i = 0; i < steps; i++) {
        const vp = page.viewportSize() ?? { width: 1280, height: 800 };
        await humanMove(page, randInt(50, vp.width - 50), randInt(50, vp.height - 50));
        if (scroll && i % 2 === 1) await humanScroll(page, randInt(180, 420));
        await humanPause(300, 900);
        await assertNoAntiBot(page);
      }
      return { ok: true };
    },

    'human.idle': async ({ durationMs = 1800 }: any = {}) => {
      const page = await ctx.p();
      await humanIdle(page, Number(durationMs) || 1800);
      await assertNoAntiBot(page);
      return { ok: true, durationMs };
    },

    'human.jitter': async ({ radius = 18, moves = 4 }: any = {}) => {
      const page = await ctx.p();
      await humanJitter(page, Number(radius) || 18, Number(moves) || 4);
      await assertNoAntiBot(page);
      return { ok: true, radius, moves };
    },

    'human.skim': async ({ steps = 4, amount = 420 }: any = {}) => {
      const page = await ctx.p();
      await humanSkim(page, Number(steps) || 4, Number(amount) || 420);
      await assertNoAntiBot(page);
      return { ok: true, steps, amount };
    },

    'human.backtrack': async ({ pauseMs = 900 }: any = {}) => {
      const page = await ctx.p();
      await humanScroll(page, -randInt(220, 520));
      await humanPause(Number(pauseMs) || 900, (Number(pauseMs) || 900) + 800);
      await assertNoAntiBot(page);
      return { ok: true };
    },

    'human.focusCycle': async ({ times = 1 }: any = {}) => {
      const page = await ctx.p();
      const safeTimes = Math.max(1, Math.min(Number(times) || 1, 5));
      for (let i = 0; i < safeTimes; i++) {
        await page.keyboard.press('Tab');
        await humanPause(250, 850);
      }
      await assertNoAntiBot(page);
      return { ok: true, times: safeTimes };
    },

    'human.goBack': async ({ waitMs = 1200 }: any = {}) => {
      const page = await ctx.p();
      await humanPause(250, 900);
      await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => null);
      await humanPause(Number(waitMs) || 1200, (Number(waitMs) || 1200) + 1200);
      await assertNoAntiBot(page);
      return { ok: true, url: page.url(), title: await page.title() };
    },

    'human.goForward': async ({ waitMs = 1200 }: any = {}) => {
      const page = await ctx.p();
      await humanPause(250, 900);
      await page.goForward({ waitUntil: 'domcontentloaded' }).catch(() => null);
      await humanPause(Number(waitMs) || 1200, (Number(waitMs) || 1200) + 1200);
      await assertNoAntiBot(page);
      return { ok: true, url: page.url(), title: await page.title() };
    },

    'human.scan': async ({ steps = 4, amount = 520, textFilter, filterAny, filterLines, limitPerStep = 40 }: any = {}) => {
      if (!ctx.dispatch) throw new Error('human.scan requires dispatcher');
      const page = await ctx.p();
      const snapshots = [];
      const safeSteps = Math.max(1, Math.min(Number(steps) || 4, 20));
      for (let i = 0; i < safeSteps; i++) {
        await assertNoAntiBot(page);
        const visible = await ctx.dispatch('dom.visibleText', {
          textFilter,
          filterAny,
          filterLines,
          limit: Math.max(1, Math.min(Number(limitPerStep) || 40, 200)),
        });
        snapshots.push({
          step: i + 1,
          url: page.url(),
          title: await page.title(),
          count: visible.count,
          items: visible.items,
        });
        const visibleText = visible.items?.map((item: any) => item.text ?? '').join(' ') ?? '';
        if (visibleText) {
          await humanConsult(page, visibleText, {
            reason: `human.scan.step.${i + 1}`,
            onFeedback: (event) => humanFeedback(ctx, { ...event, step: i + 1, totalSteps: safeSteps }),
          });
        }
        if (i < safeSteps - 1) {
          humanFeedback(ctx, {
            phase: 'scrolling',
            reason: 'human.scan',
            step: i + 1,
            totalSteps: safeSteps,
            timing: getHumanTimingProfile(),
          });
          await humanScroll(page, Number(amount) || 520);
          await humanPause(900, 2200);
        }
      }
      return { ok: true, snapshots };
    },

    'human.findText': async ({ text, exact = false, maxScrolls = 4, consultMs = 0, timeoutMs = 8000 }: any) => {
      if (!text) throw new Error('human.findText: text is required');
      const page = await ctx.p();
      const needle = String(text);
      const safeScrolls = Math.max(0, Math.min(Number(maxScrolls) || 0, 20));
      // Hard global timeout so the call never gets killed by a parent SIGKILL.
      // Was uncapped + `humanConsult` could spend up to 18-45 s in "hit-review".
      const deadline = Date.now() + Math.max(2000, Math.min(Number(timeoutMs) || 8000, 30_000));
      for (let attempt = 0; attempt <= safeScrolls; attempt++) {
        if (Date.now() > deadline) {
          return { found: false, hits: [], reason: 'timeout', attempt };
        }
        await assertNoAntiBot(page);
        const hits = await page.evaluate(
          ({ needle, exact }) => {
            const out: any[] = [];
            const q = String(needle).toLowerCase();
            for (const el of Array.from(document.body.querySelectorAll('*')) as Element[]) {
              const h = el as HTMLElement;
              const value = (h.innerText || h.textContent || '').replace(/\s+/g, ' ').trim();
              if (!value) continue;
              const hay = value.toLowerCase();
              if (exact ? hay !== q : !hay.includes(q)) continue;
              const style = window.getComputedStyle(el);
              if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
              const r = el.getBoundingClientRect();
              if (r.width < 2 || r.height < 2) continue;
              const childSame = (Array.from(el.children) as Element[]).some((child) => {
                const childText = ((child as HTMLElement).innerText || child.textContent || '').replace(/\s+/g, ' ').trim();
                return childText === value;
              });
              if (childSame) continue;
              out.push({
                text: value,
                tag: el.tagName.toLowerCase(),
                role: h.getAttribute('role') || '',
                box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
              });
              if (out.length >= 20) break;
            }
            return out;
          },
          { needle, exact },
        );
        if (hits.length) {
          // hit-review: short glance instead of full humanConsult (which used to
          // spend up to 18-45 s reading). Caller can pass consultMs > 0 to opt
          // back into a long pause; default 0 = act immediately.
          const safeConsult = Math.max(0, Math.min(Number(consultMs) || 0, 5000));
          if (safeConsult > 0) {
            humanFeedback(ctx, { phase: 'consulting', reason: 'human.findText.hit-review', durationMs: safeConsult });
            await sleep(safeConsult);
          } else {
            await humanPause(120, 280);
          }
          return { found: true, attempt, hits };
        }
        if (attempt < safeScrolls) {
          humanFeedback(ctx, {
            phase: 'scrolling',
            reason: 'human.findText',
            attempt,
            maxScrolls: safeScrolls,
            timing: getHumanTimingProfile(),
          });
          await humanScroll(page, 520);
          // Tighter inter-scroll wait (was 900-2200).
          await humanPause(250, 700);
        }
      }
      return { found: false, hits: [] };
    },

    'human.clickText': async ({ text, exact = false, maxScrolls = 4, timeoutMs = 8000 }: any) => {
      if (!ctx.dispatch) throw new Error('human.clickText requires dispatcher');
      const page = await ctx.p();
      const safeTimeout = Math.max(2000, Math.min(Number(timeoutMs) || 15000, 30_000));
      const startedAt = Date.now();
      humanFeedback(ctx, { phase: 'click-text.finding', text, timeoutMs: safeTimeout });
      const found = await ctx.dispatch('human.findText', { text, exact, maxScrolls, timeoutMs: safeTimeout, consultMs: 0 });
      if (!found.found || !found.hits?.length) {
        const reason = found.reason === 'timeout' ? ' (timeout)' : '';
        throw new Error(`human.clickText: visible text not found${reason}: ${text}`);
      }
      const hit = found.hits[0];
      const x = hit.box.x + Math.round(hit.box.w / 2);
      const y = hit.box.y + Math.round(Math.min(hit.box.h / 2, 24));
      try {
        humanFeedback(ctx, { phase: 'click-text.coordinates', x, y, elapsedMs: Date.now() - startedAt });
        await humanPreClick(page, x, y);
        humanFeedback(ctx, { phase: 'click-text.clicking', x, y, elapsedMs: Date.now() - startedAt });
        await page.mouse.click(x, y, { delay: randInt(20, 60) });
        await flashClick(page, x, y);
        await humanPause(120, 350);
        await assertNoAntiBot(page);
        return { clicked: hit.text, x, y, url: page.url(), title: await page.title(), method: 'coordinates' };
      } catch (err: any) {
        humanFeedback(ctx, { phase: 'click-text.coordinate-failed', error: err?.message ?? String(err), elapsedMs: Date.now() - startedAt });
        await annotateInteractive(page);
        const q = String(text).toLowerCase();
        const ref = getAgentElements().find((el) => {
          const hay = `${el.name} ${el.role}`.toLowerCase();
          return exact ? hay.trim() === q : hay.includes(q);
        });
        if (!ref) throw err;
        humanFeedback(ctx, { phase: 'click-text.fallback-ref', ref: ref.id, elapsedMs: Date.now() - startedAt });
        const result = await ctx.dispatch('agent.click', { ref: ref.id, retry: false });
        return { ...result, method: 'agent.click.fallback' };
      }
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
    'vision.screenshot': async ({ fullPage = false, quality = 70, save = true }: any = {}) => {
      const page = await ctx.p();
      const buf = await page.screenshot({ type: 'jpeg', quality, fullPage });
      const result: any = { image: buf.toString('base64'), url: page.url(), title: await page.title() };
      if (save) {
        const dir = join(process.cwd(), 'logs', 'screenshots');
        await mkdir(dir, { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `screenshot-${ts}.jpg`;
        await writeFile(join(dir, filename), buf);
        const port = process.env.PORT ?? 8080;
        result.imageUrl = `http://localhost:${port}/captures/${filename}`;
        result.path = join(dir, filename);
      }
      return result;
    },
  };
}
