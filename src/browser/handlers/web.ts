import type { HandlerContext, Handler } from './types.js';
import { SEARCH_URLS } from './navigation.js';
import { assertNoAntiBot } from '../polite.js';

const SEARCH_ENGINES = ['google', 'bing', 'duckduckgo'] as const;
type SearchEngine = typeof SEARCH_ENGINES[number];

function clampSearchLimit(limit: unknown) {
  const n = Number(limit);
  if (!Number.isFinite(n)) return 20;
  return Math.max(1, Math.min(Math.round(n), 100));
}

function searchPageUrl(engine: SearchEngine, query: string, pageIndex: number) {
  const q = encodeURIComponent(query);
  if (engine === 'google') return `https://www.google.com/search?q=${q}${pageIndex > 0 ? `&start=${pageIndex * 10}` : ''}`;
  if (engine === 'bing') return `https://www.bing.com/search?q=${q}${pageIndex > 0 ? `&first=${pageIndex * 10 + 1}` : ''}`;
  if (engine === 'duckduckgo') return `https://duckduckgo.com/?q=${q}${pageIndex > 0 ? `&s=${pageIndex * 30}` : ''}`;
  return SEARCH_URLS[engine](query);
}

function compactResult(result: any) {
  return {
    title: String(result.title ?? '').trim(),
    url: String(result.url ?? '').trim(),
    snippet: String(result.snippet ?? '').replace(/\s+/g, ' ').trim(),
    kind: result.kind || 'organic',
  };
}

export function webHandlers(ctx: HandlerContext): Record<string, Handler> {
  return {
    'web.search': async ({
      query,
      engine = 'google',
      limit = 20,
      pages,
      useForm = true,
      timeout = 15000,
      organicOnly = false,
    }: any = {}) => {
      if (!query || typeof query !== 'string') throw new Error('web.search: query is required');
      if (!SEARCH_ENGINES.includes(engine)) throw new Error(`web.search: unsupported engine "${engine}"`);
      if (!ctx.dispatch) throw new Error('web.search requires dispatcher');

      const wanted = clampSearchLimit(limit);
      const maxPages = Math.max(1, Math.min(Number(pages) || Math.ceil(wanted / 10) + 1, 10));
      const page = await ctx.p();
      const results: any[] = [];
      const seen = new Set<string>();
      const report: any = {
        query,
        engine,
        requested: wanted,
        pagesVisited: 0,
        blocked: false,
        strategy: useForm ? 'home-form-then-pagination' : 'direct-pagination',
        pageCounts: [] as any[],
        warnings: [] as string[],
      };

      for (let pageIndex = 0; pageIndex < maxPages && results.length < wanted; pageIndex++) {
        if (pageIndex === 0 && useForm) {
          await ctx.dispatch('navigate', { url: engine === 'google' ? 'https://www.google.com' : SEARCH_URLS[engine](query).split('?')[0] });
          try {
            await ctx.dispatch('form.search', { query, timeout });
          } catch (err: any) {
            report.warnings.push(`form search fallback: ${err?.message ?? String(err)}`);
            await ctx.dispatch('navigate', { url: searchPageUrl(engine, query, pageIndex) });
          }
        } else {
          await ctx.dispatch('navigate', { url: searchPageUrl(engine, query, pageIndex) });
        }

        await page.waitForLoadState('domcontentloaded', { timeout }).catch(() => {});
        await page.waitForTimeout(900);
        const anti = await ctx.dispatch('human.antispam.check', {});
        report.blocked = Boolean(anti.blocked);
        if (report.blocked) {
          report.warnings.push(`blocked on page ${pageIndex + 1}`);
          break;
        }
        await assertNoAntiBot(page);
        const extracted = await ctx.dispatch('dom.extract', { type: 'search-results', limit: wanted });
        const pageResults = Array.isArray(extracted.results) ? extracted.results.map(compactResult) : [];
        report.pagesVisited += 1;
        report.pageCounts.push({ page: pageIndex + 1, count: pageResults.length, url: page.url() });

        for (const item of pageResults) {
          if (!item.title || !item.url) continue;
          if (organicOnly && item.kind !== 'organic') continue;
          if (seen.has(item.url)) continue;
          seen.add(item.url);
          results.push(item);
          if (results.length >= wanted) break;
        }
      }

      const status = report.blocked
        ? 'blocked'
        : results.length >= wanted
          ? 'complete'
          : 'partial';
      return {
        type: 'web-search',
        status,
        count: results.length,
        url: page.url(),
        title: await page.title().catch(() => ''),
        report,
        results: results.slice(0, wanted),
      };
    },
  };
}
