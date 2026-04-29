import type { HandlerContext, Handler } from './types.js';
import { extractFrenchPhones } from './phone.js';
import { buildJsonSchemaPrompt, extractWithSchema } from '../schemaExtract.js';
import { assertNoAntiBot, assertUsefulPage } from '../polite.js';

export function extractionHandlers(ctx: HandlerContext): Record<string, Handler> {
  return {
    'dom.extract': async ({ type, schema, llm = false }: any = {}) => {
      const page = await ctx.p();
      await assertNoAntiBot(page);
      await assertUsefulPage(page, 'dom.extract');
      if (schema) {
        if (llm) {
          return {
            type: 'schema-llm-prompt',
            prompt: buildJsonSchemaPrompt(schema, await page.evaluate(() => document.body.innerText)),
            note: 'Send this prompt to an LLM client and parse the JSON response. OpenClaw does not call external LLMs from the bridge process.',
          };
        }
        const extracted = await extractWithSchema(page, schema) as { data: unknown; missing: string[] };
        return { type: 'schema', ...extracted };
      }
      if (type === 'search-results') {
        const results = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('h3')).map(h => ({
            title: h.innerText,
            url: h.closest('a')?.href || h.parentElement?.querySelector('a')?.href,
            snippet: h.parentElement?.innerText?.slice(0, 300)
          })).filter(x => x.title && x.url);
        });
        return { type, results };
      } else if (type === 'form') {
        const fields = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('input, select, textarea')).map((el: any) => ({
            tag: el.tagName.toLowerCase(),
            type: el.type,
            name: el.name || el.id,
            placeholder: el.placeholder,
            required: el.required,
            label: document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim()
          }));
        });
        return { type, fields };
      } else if (type === 'article') {
        const article = await page.evaluate(() => {
          const title = document.querySelector('h1')?.innerText || document.title;
          const content = Array.from(document.querySelectorAll('p, h2, h3'))
            .map(el => el.textContent?.trim())
            .filter(Boolean)
            .join('\n\n')
            .slice(0, 5000);
          return { title, content };
        });
        return { type, article };
      } else if (type === 'table') {
        const tables = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('table')).map(table => {
            const rows = Array.from(table.querySelectorAll('tr')).slice(0, 20);
            return rows.map(tr => Array.from(tr.querySelectorAll('td, th')).map(td => td.textContent?.trim()));
          });
        });
        return { type, tables };
      } else if (type === 'google-maps') {
        const raw = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('[data-result-id], .VwiC3b, .tF2Cxc')).map(el => ({
            title: el.querySelector('h3, .OSrXXb')?.textContent || '',
            text: el.textContent || '',
            rating: el.querySelector('.K9E9v, .oqST9c')?.textContent || '',
          }));
        });
        const ADDRESS_RE = /\d+\s+[A-Za-zÀ-ÿ\s'-]+(?:rue|avenue|boulevard|place|chemin|impasse|route|quai|allée)[A-Za-zÀ-ÿ\s'-]+\d{5}/i;
        const results = raw.map(r => ({
          title: r.title,
          phone: extractFrenchPhones(r.text)[0] ?? '',
          rating: r.rating,
          address: r.text.match(ADDRESS_RE)?.[0] ?? '',
        })).filter(r => r.title && (r.phone || r.address));
        return { type, results };
      }
      return { text: await page.evaluate(() => document.body.innerText) };
    },

    'dom.visibleText': async ({ query, textFilter, limit = 300, includeHidden = false }: any = {}) => {
      const page = await ctx.p();
      await assertNoAntiBot(page);
      await assertUsefulPage(page, 'dom.visibleText');
      const max = Math.max(1, Math.min(Number(limit) || 300, 2000));
      const items = await page.evaluate(
        ({ query, textFilter, limit, includeHidden }) => {
          const root = query ? document.querySelector(query) : document.body;
          if (!root) return [];
          const filter = textFilter ? new RegExp(textFilter, 'i') : null;
          const out: any[] = [];
          for (const el of Array.from(root.querySelectorAll('*')) as Element[]) {
            const h = el as HTMLElement;
            const raw = h.innerText || h.textContent || '';
            const text = raw.replace(/\s+/g, ' ').trim();
            if (!text) continue;
            if (filter && !filter.test(text)) continue;
            const style = window.getComputedStyle(el);
            if (!includeHidden && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) continue;
            const r = el.getBoundingClientRect();
            if (!includeHidden && (r.width < 1 || r.height < 1)) continue;
            const childrenText = (Array.from(el.children) as Element[])
              .map((child) => ((child as HTMLElement).innerText || child.textContent || '').replace(/\s+/g, ' ').trim())
              .filter(Boolean);
            if (childrenText.some((childText) => childText === text)) continue;
            const tag = el.tagName.toLowerCase();
            const id = h.id;
            const aria = el.getAttribute('aria-label');
            const cls = String(h.className || '')
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 3)
              .map((c) => `.${CSS.escape(c)}`)
              .join('');
            const selector = id
              ? `${tag}#${CSS.escape(id)}`
              : aria
                ? `${tag}[aria-label="${aria.replace(/"/g, '\\"').slice(0, 80)}"]`
                : `${tag}${cls}`;
            out.push({
              text,
              tag,
              role: h.getAttribute('role') || '',
              ariaLabel: h.getAttribute('aria-label') || '',
              selector,
              box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
            });
            if (out.length >= limit) break;
          }
          return out;
        },
        { query, textFilter, limit: max, includeHidden },
      );
      return { type: 'visible-text', count: items.length, items };
    },
  };
}
