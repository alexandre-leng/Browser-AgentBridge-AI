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

function clampLimit(limit: unknown, fallback = 20, max = 500) {
  const n = Number(limit);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(Math.round(n), max));
}

function cleanExtractedText(text: unknown) {
  return String(text ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/\.[a-z0-9_-]+\s*\{[^}]*\}/gi, ' ')
    .replace(/@media[^{]+\{[\s\S]*?\}\s*\}/gi, ' ')
    .replace(/\bcontent:\s*['"][^'"]*['"];?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].replace(/\s+/g, ' ').trim();
  }
  return '';
}

function toCsv(rows: Record<string, unknown>[]) {
  const columns = ['title', 'price', 'location', 'category', 'delivery', 'sponsored', 'url', 'image', 'summary'];
  const esc = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [columns.join(','), ...rows.map((row) => columns.map((col) => esc(row[col])).join(','))].join('\n');
}

function normalizeMarketplaceItem(raw: any, source = 'dom') {
  const text = cleanExtractedText(raw.text ?? raw.summary ?? '');
  const title = cleanExtractedText(raw.title || firstMatch(text, [
    /^(.+?)\s+\d[\d\s]*€/,
    /^(.+?)\s+Prix\s*:/i,
  ]));
  const price = cleanExtractedText(raw.price || firstMatch(text, [
    /Prix\s*:\s*([0-9][0-9\s]*(?:[,.]\d{1,2})?\s*€)/i,
    /\b([0-9][0-9\s]*(?:[,.]\d{1,2})?\s*€)\b/,
  ]));
  const location = cleanExtractedText(raw.location || firstMatch(text, [
    /Située?\s+à\s+([^.]+)\./i,
    /\b([A-ZÀ-Ÿ][A-Za-zÀ-ÿ'’ -]+(?:\s+\d{5})(?:\s+[A-Za-zÀ-ÿ'’ -]+)?)\b/,
  ]));
  const category = cleanExtractedText(raw.category || firstMatch(text, [
    /Catégorie\s*:\s*([^.]+)\./i,
  ]));
  return {
    title,
    price,
    location,
    category,
    delivery: Boolean(raw.delivery ?? /Livraison possible|shipping available/i.test(text)),
    sponsored: Boolean(raw.sponsored ?? /Sponsorisé|Sponsored|À la une/i.test(text)),
    url: raw.url || raw.website || '',
    image: raw.image || '',
    summary: text.slice(0, 500),
    source,
  };
}

function cleanMapsAddress(address: string) {
  return cleanExtractedText(address)
    .replace(/\b(?:Ouvert|Fermé|Ouvre bientôt|Open|Closed)\b.*$/i, '')
    .replace(/[,\s]+$/, '')
    .trim();
}

function normalizeSearchUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('google.') && parsed.pathname === '/url') {
      const target = parsed.searchParams.get('q') || parsed.searchParams.get('url');
      if (target) return target;
    }
    return parsed.href;
  } catch {
    return url;
  }
}

export function extractionHandlers(ctx: HandlerContext): Record<string, Handler> {
  return {
    'dom.extract': async ({ type, schema, llm = false, limit, format }: any = {}) => {
      const page = await ctx.p();
      await assertNoAntiBot(page);
      await assertUsefulPage(page, 'dom.extract');
      const maxItems = clampLimit(limit, type === 'marketplace' ? 20 : 80);
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
        const raw = await page.evaluate((limit) => {
          const clean = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
          const badUrl = (href: string) => {
            try {
              const url = new URL(href);
              return /(^|\.)google\./i.test(url.hostname) && !['/url', '/search'].includes(url.pathname);
            } catch {
              return false;
            }
          };
          const containers = Array.from(document.querySelectorAll('div.tF2Cxc, div.MjjYud, li.b_algo, article, [data-testid="result"], .result')) as HTMLElement[];
          const source = containers.length ? containers : Array.from(document.querySelectorAll('a:has(h3), h3')) as HTMLElement[];
          const out: any[] = [];
          const seen = new Set<string>();
          for (const node of source) {
            const headings = (node.matches('h3, h2, [role="heading"]') ? [node] : Array.from(node.querySelectorAll('h3, [role="heading"], h2'))) as HTMLElement[];
            const h = headings.find((candidate) => {
              const text = clean(candidate.innerText || candidate.textContent);
              return text && !/^(résultats web|web results|résultats de recherche|search results)$/i.test(text);
            }) || null;
            const link = (h?.closest('a[href]') || node.querySelector?.('a[href]') || node.closest?.('a[href]')) as HTMLAnchorElement | null;
            const title = clean(h?.innerText || h?.textContent || link?.textContent);
            const href = link?.href || '';
            if (!title || !href || badUrl(href)) continue;
            const text = clean((node as HTMLElement).innerText || node.textContent);
            const lower = text.toLowerCase();
            const kind =
              /sponsorisé|sponsored|annonce/.test(lower) ? 'sponsored' :
              /vidéo|video|youtube|tiktok|facebook/.test(lower) ? 'video' :
              /autres questions|people also ask/.test(lower) ? 'question' :
              'organic';
            const key = href;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ title, url: href, snippet: text.slice(0, 500), kind });
            if (out.length >= limit) break;
          }
          return out;
        }, maxItems * 2);
        const seen = new Set<string>();
        const results = raw
          .map((r: any) => ({ ...r, url: normalizeSearchUrl(r.url), snippet: cleanExtractedText(r.snippet).slice(0, 300) }))
          .filter((r: any) => {
            if (!r.title || !r.url || seen.has(r.url)) return false;
            seen.add(r.url);
            return true;
          })
          .slice(0, maxItems);
        return { type, count: results.length, url: page.url(), title: await page.title().catch(() => ''), results };
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
        const raw = await page.evaluate((limit) => {
          const textOf = (el: Element | null) => {
            if (!el) return '';
            const clone = el.cloneNode(true) as HTMLElement;
            clone.querySelectorAll('script, style, noscript, template, svg').forEach((node) => node.remove());
            return (clone.innerText || clone.textContent || '').replace(/\s+/g, ' ').trim();
          };
          const selectors = [
            '[role="article"]',
            '[role="feed"] > div',
            '.Nv2PK',
            '.THOPZb',
            '.hfpxzc',
            '[data-result-id]',
            '.VkpGBb',
            '.tF2Cxc',
          ].join(', ');
          const nodes = Array.from(document.querySelectorAll(selectors)) as HTMLElement[];
          const seen = new Set<string>();
          const out: any[] = [];
          for (const el of nodes) {
            const text = textOf(el);
            if (text.length < 20) continue;
            const link = (el.querySelector('a[href*="/maps/place/"], a[href*="google.com/maps/place/"]') || el.closest('a[href*="/maps/place/"]')) as HTMLAnchorElement | null;
            const title =
              textOf(el.querySelector('[role="heading"], .qBF1Pd, .fontHeadlineSmall, h3')) ||
              link?.getAttribute('aria-label') ||
              text.split(/\s+\d[,.]\d|\s+\([0-9\s]+\)/)[0]?.trim() ||
              '';
            const key = link?.href || `${title}|${text.slice(0, 80)}`;
            if (!title || seen.has(key)) continue;
            seen.add(key);
            out.push({
              title,
              text,
              url: link?.href || '',
              rating: text.match(/\b([0-5][,.]\d)\s*\(([\d\s]+)\)/)?.[1] || '',
              reviews: text.match(/\b[0-5][,.]\d\s*\(([\d\s]+)\)/)?.[1] || '',
            });
            if (out.length >= limit) break;
          }
          return out;
        }, maxItems);
        const ADDRESS_RE = /\b\d{1,5}\s+(?:rue|avenue|av\.?|boulevard|bd\.?|place|chemin|impasse|route|quai|allée|allee|cours|square)\s+[A-Za-zÀ-ÿ0-9\s'’.-]+/i;
        const results = raw.map(r => {
          const cleaned = cleanExtractedText(r.text);
          const hoursMatch = cleaned.match(/\b(?:Ouvert|Fermé|Ouvre bientôt|Open|Closed)\b[^·\n]{0,80}/i);
          return {
            title: cleanExtractedText(r.title),
            phone: extractFrenchPhones(cleaned)[0] ?? '',
            rating: r.rating ? Number(String(r.rating).replace(',', '.')) : null,
            reviews: r.reviews ? Number(String(r.reviews).replace(/\s+/g, '')) : null,
            address: cleanMapsAddress(cleaned.match(ADDRESS_RE)?.[0] ?? ''),
            website: r.url || '',
            hours: hoursMatch?.[0] ?? '',
            summary: cleaned.slice(0, 280),
          };
        }).filter(r => r.title && (r.phone || r.address || r.website || r.rating !== null)).slice(0, maxItems);
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
            const clone = el.cloneNode(true) as HTMLElement;
            clone.querySelectorAll('script, style, noscript, template').forEach((node) => node.remove());
            const text = (clone.innerText || clone.textContent || '').replace(/\s+/g, ' ').trim();
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
          }).filter(Boolean).slice(0, 200);
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
            summary: cleanExtractedText(r.text).slice(0, 280),
          };
        }).filter((r) => r.name && (r.address || r.phone || r.website || r.rating !== null)).slice(0, maxItems);
        return { type, listings };
      } else if (type === 'marketplace') {
        const raw = await page.evaluate((limit) => {
          const visible = (el: Element) => {
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && rect.width > 4 && rect.height > 4;
          };
          const textOf = (el: Element | null) => {
            if (!el) return '';
            const clone = el.cloneNode(true) as HTMLElement;
            clone.querySelectorAll('script, style, noscript, template, svg').forEach((node) => node.remove());
            return (clone.innerText || clone.textContent || '').replace(/\s+/g, ' ').trim();
          };
          const cardSelectors = [
            'article',
            '[role="article"]',
            '[role="listitem"]',
            '[data-test-id*="ad"]',
            '[data-testid*="ad"]',
            '[data-qa-id*="ad"]',
            'li:has(a[href*="/ad/"])',
            'a[href*="/ad/"]',
            'a[href*="/annonces/"]',
            'a[href*="/item/"]',
            'a[href*="/itm/"]',
            'a[href*="/marketplace/item/"]',
          ].join(', ');
          const nodes = Array.from(document.querySelectorAll(cardSelectors)) as HTMLElement[];
          const linkNodes = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[];
          const candidates = nodes.length ? nodes : linkNodes;
          const seen = new Set<string>();
          const out: any[] = [];
          for (const node of candidates) {
            if (!visible(node)) continue;
            const link = ((node.matches('a[href]') ? node as HTMLAnchorElement : node.querySelector('a[href]')) || node.closest('a[href]')) as HTMLAnchorElement | null;
            const href = link?.href || '';
            const text = textOf(node);
            if (text.length < 8 || text.length > 3500) continue;
            if (!/[0-9][0-9\s]*(?:[,.]\d{1,2})?\s*(?:€|\$|£|EUR|USD|GBP)|prix|price|livraison|shipping|située?|located/i.test(text)) continue;
            const titleNode = node.querySelector('h1,h2,h3,[role="heading"],[data-test-id*="title"],[data-testid*="title"],p[class*="title"],span[class*="title"]') as HTMLElement | null;
            const priceNode = node.querySelector('[aria-label*="Prix"],[aria-label*="Price"],[data-test-id*="price"],[data-testid*="price"],[class*="price"],[class*="Price"]') as HTMLElement | null;
            const img = node.querySelector('img') as HTMLImageElement | null;
            const title = textOf(titleNode) || link?.getAttribute('aria-label') || text.split(/\s+\d[\d\s]*(?:[,.]\d{1,2})?\s*(?:€|\$|£|EUR|USD|GBP)\b/i)[0]?.trim() || '';
            const price = textOf(priceNode);
            const key = href || `${title}|${text.slice(0, 100)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({
              title,
              price,
              text,
              url: href,
              image: img?.currentSrc || img?.src || '',
              sponsored: /Sponsorisé|Sponsored|À la une/i.test(text),
              delivery: /Livraison possible|shipping available/i.test(text),
            });
            if (out.length >= Math.min(limit * 4, 200)) break;
          }
          return out;
        }, maxItems);
        const items: any[] = [];
        const seen = new Set<string>();
        for (const rawItem of raw) {
          const item = normalizeMarketplaceItem(rawItem, 'marketplace');
          if (!item.title || (!item.price && !item.url)) continue;
          const key = item.url || `${item.title}|${item.price}|${item.location}`;
          if (seen.has(key)) continue;
          seen.add(key);
          items.push(item);
          if (items.length >= maxItems) break;
        }
        const result = {
          type,
          count: items.length,
          url: page.url(),
          title: await page.title().catch(() => ''),
          items,
        };
        return format === 'csv' ? { ...result, csv: toCsv(items) } : result;
      }
      return { text: await page.evaluate(() => document.body.innerText) };
    },

    'scrape.results': async ({ type = 'marketplace', limit = 20, format = 'json' }: any = {}) => {
      if (!ctx.dispatch) throw new Error('scrape.results requires dispatcher');
      const result = await ctx.dispatch('dom.extract', { type, limit, format });
      if (format === 'csv' && result.csv) return result;
      if (format === 'json') return result;
      throw new Error('scrape.results: format must be json or csv');
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
