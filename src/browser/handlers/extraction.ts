import type { HandlerContext, Handler } from './types.js';
import { extractFrenchPhones } from './phone.js';
import { buildJsonSchemaPrompt, extractWithSchema } from '../schemaExtract.js';
import { assertNoAntiBot, assertUsefulPage } from '../polite.js';

function normalizeFilterTerms(textFilter?: string, filterAny?: string[] | string) {
  if (Array.isArray(filterAny)) return filterAny.map(String).map(s => s.trim()).filter(Boolean);
  if (typeof filterAny === 'string') return filterAny.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
  if (!textFilter) return [];
  if (textFilter.includes('|')) return [];
  return textFilter.split(',').map(s => s.trim()).filter(Boolean);
}

export function extractionHandlers(ctx: HandlerContext): Record<string, Handler> {
  return {
    'dom.extract': async ({ type, schema, llm = false }: any = {}) => {
      const page = await ctx.p();
      await assertNoAntiBot(page);
      await assertUsefulPage(page, 'dom.extract');
      if (type === 'custom') {
        if (!schema || !schema.itemSelector || !schema.fields) {
          throw new Error('For custom extraction, schema must contain itemSelector and fields mapping.');
        }
        const extracted = await page.evaluate(({ schema }) => {
          const items: any[] = [];
          const getElementVal = (el: Element, sel: string): string => {
            if (sel.startsWith('xpath=')) {
              const xp = sel.slice(6);
              const result = document.evaluate(xp, el, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
              return result.singleNodeValue?.textContent?.trim() || '';
            }
            return el.querySelector(sel)?.textContent?.trim() || '';
          };
          
          let nodes: Element[] = [];
          if (schema.itemSelector.startsWith('xpath=')) {
            const xp = schema.itemSelector.slice(6);
            const result = document.evaluate(xp, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            for (let i = 0; i < result.snapshotLength; i++) {
              const node = result.snapshotItem(i);
              if (node instanceof Element) nodes.push(node);
            }
          } else {
            nodes = Array.from(document.querySelectorAll(schema.itemSelector));
          }
          
          for (const node of nodes) {
            const item: any = {};
            for (const [key, sel] of Object.entries(schema.fields)) {
              if (typeof sel === 'string') {
                item[key] = getElementVal(node, sel);
              }
            }
            items.push(item);
          }
          return items;
        }, { schema });
        return { type, results: extracted };
      }
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
          const isAd = (el: Element): boolean => {
            const p = el.closest('[class*="ad"], [id*="ad"], [class*="sponsored"], [data-text-ad]');
            return p !== null;
          };
          const isTrackingUrl = (url: string): boolean => {
            return /[?&](ad|ads|sponsored)/i.test(url) || url.includes('/y.js?');
          };
          return Array.from(document.querySelectorAll('h3')).map(h => {
            const link = h.closest('a') || h;
            const url = h.closest('a')?.href || h.parentElement?.querySelector('a')?.href || '';
            return {
              title: h.innerText,
              url,
              snippet: h.parentElement?.innerText?.slice(0, 300) || '',
              _skip: !url || isTrackingUrl(url) || isAd(link)
            };
          }).filter(x => x.title && !x._skip).map(({ _skip, ...r }) => r);
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
          const htmlTables = Array.from(document.querySelectorAll('table')).map(table => ({
            type: 'html',
            rows: Array.from(table.querySelectorAll('tr')).slice(0, 20)
              .map(tr => Array.from(tr.querySelectorAll('td, th')).map(td => td.textContent?.trim()))
          }));
          const gridTables = Array.from(document.querySelectorAll('[role="grid"], [role="table"]')).map(grid => ({
            type: 'aria',
            rows: Array.from(grid.querySelectorAll('[role="row"]')).slice(0, 20)
              .map(row => Array.from(row.querySelectorAll('[role="cell"], [role="gridcell"], [role="columnheader"]'))
                .map(cell => cell.textContent?.trim()))
          }));
          return [...htmlTables, ...gridTables];
        });
        const message = tables.length === 0 ? 'No tables or grids found on this page.' : undefined;
        return { type, tables, message };
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
      } else if (type === 'listings') {
        const raw = await page.evaluate(() => {
          const selectors = [
            '[role="article"]',
            '[role="listitem"]',
            '[data-result-id]',
            '.Nv2PK',
            '.hfpxzc',
            '.VkpGBb',
            '.tF2Cxc',
            'article',
          ].join(', ');
          const nodes = Array.from(document.querySelectorAll(selectors)) as HTMLElement[];
          const candidates = nodes.length ? nodes : Array.from(document.querySelectorAll('a, div')) as HTMLElement[];
          const seen = new Set<string>();
          return candidates.map((el) => {
            const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
            if (text.length < 12 || text.length > 2500) return null;
            const link = (el.closest('a') as HTMLAnchorElement | null) || el.querySelector('a[href]') as HTMLAnchorElement | null;
            const title =
              el.getAttribute('aria-label') ||
              el.querySelector('h1,h2,h3,[role="heading"],.qBF1Pd,.OSrXXb')?.textContent?.trim() ||
              text.split(/[·\n]/)[0]?.trim() ||
              '';
            const key = `${title}|${text.slice(0, 80)}`;
            if (seen.has(key)) return null;
            seen.add(key);
            return { title, text, url: link?.href || '' };
          }).filter(Boolean).slice(0, 80);
        }) as { title: string; text: string; url: string }[];
        const ADDRESS_RE = /\b\d{1,5}\s+(?:rue|avenue|av\.?|boulevard|bd\.?|place|chemin|impasse|route|quai|allée|allee|cours|square)\s+[A-Za-zÀ-ÿ0-9\s'’.-]+/i;
        const listings = raw.map((r) => {
          const ratingMatch = r.text.match(/\b([0-5](?:[.,]\d)?)\s*(?:\(\s*([\d\s]+)\s*\)|(?:étoiles?|stars?)?)?/i);
          const reviewsMatch = r.text.match(/(?:\(([\d\s]+)\)|([\d\s]+)\s+(?:avis|reviews?))/i);
          const hoursMatch = r.text.match(/\b(?:Ouvert|Fermé|Open|Closed)\b[^·\n]{0,80}/i);
          return {
            name: r.title,
            rating: ratingMatch ? Number(ratingMatch[1].replace(',', '.')) : null,
            reviews: reviewsMatch ? Number((reviewsMatch[1] || reviewsMatch[2]).replace(/\s+/g, '')) : null,
            address: r.text.match(ADDRESS_RE)?.[0] ?? '',
            phone: extractFrenchPhones(r.text)[0] ?? '',
            website: r.url,
            hours: hoursMatch?.[0] ?? '',
            summary: r.text.slice(0, 280),
          };
        }).filter((r) => r.name && (r.address || r.phone || r.website || r.rating !== null));
        return { type, listings };
      }
      return { text: await page.evaluate(() => document.body.innerText) };
    },

    'dom.visibleText': async ({ query, textFilter, filterAny, filterLines = false, limit = 300, includeHidden = false }: any = {}) => {
      const page = await ctx.p();
      await assertNoAntiBot(page);
      await assertUsefulPage(page, 'dom.visibleText');
      const max = Math.max(1, Math.min(Number(limit) || 300, 2000));
      const filterTerms = normalizeFilterTerms(textFilter, filterAny);
      const items = await page.evaluate(
        ({ query, textFilter, filterTerms, filterLines, limit, includeHidden }) => {
          const root = query ? document.querySelector(query) : document.body;
          if (!root) return [];
          const filter = textFilter && !filterTerms.length ? new RegExp(textFilter, 'i') : null;
          const matchesTerms = (text: string) => !filterTerms.length || filterTerms.some((term: string) => text.toLowerCase().includes(term.toLowerCase()));
          const out: any[] = [];
          for (const el of Array.from(root.querySelectorAll('*')) as Element[]) {
            const h = el as HTMLElement;
            const raw = h.innerText || h.textContent || '';
            const text = raw.replace(/\s+/g, ' ').trim();
            if (!text) continue;
            if (filter && !filter.test(text)) continue;
            if (!filter && !matchesTerms(text)) continue;
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
            const lines = filterLines
              ? raw.split(/\r?\n/).map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean).filter(line => filter ? filter.test(line) : matchesTerms(line))
              : [text];
            for (const line of lines) out.push({
              text: line,
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
        { query, textFilter, filterTerms, filterLines: Boolean(filterLines), limit: max, includeHidden },
      );
      return { type: 'visible-text', count: items.length, items };
    },
  };
}
