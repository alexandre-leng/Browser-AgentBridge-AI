import type { HandlerContext, Handler } from './types.js';
import { validate, validateUrl } from './validate.js';

const ENGINES = ['google', 'bing', 'duckduckgo'] as const;

export const SEARCH_URLS: Record<string, (q: string) => string> = {
  google: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  bing: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
  duckduckgo: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
};

export function navigationHandlers(ctx: HandlerContext): Record<string, Handler> {
  return {
    navigate: async (payload: any) => {
      validate(payload, {
        url: { type: 'string', required: true, min: 1 },
        waitUntil: { type: 'string', enum: ['load', 'domcontentloaded', 'networkidle', 'commit'] },
        autoAnnotate: { type: 'boolean' },
      }, 'navigate');
      const url = validateUrl(payload.url, 'navigate');
      const page = await ctx.p();
      await page.goto(url, { waitUntil: payload.waitUntil ?? 'domcontentloaded' });
      const result: any = { url: page.url(), title: await page.title() };
      if (payload.autoAnnotate && ctx.dispatch) {
        const ann = await ctx.dispatch('page.annotate', {});
        Object.assign(result, ann);
      }
      return result;
    },

    search: async (payload: any) => {
      validate(payload, {
        engine: { type: 'string', enum: ENGINES },
        query: { type: 'string', required: true, min: 1, max: 500 },
      }, 'search');
      const engine = payload.engine ?? 'google';
      const page = await ctx.p();
      const url = SEARCH_URLS[engine]?.(payload.query);
      if (!url) throw new Error(`unknown engine: ${engine}`);
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      return { url: page.url(), title: await page.title() };
    },

    'dom.goto': async (payload: any) => {
      validate(payload, { url: { type: 'string', required: true } }, 'dom.goto');
      const url = validateUrl(payload.url, 'dom.goto');
      await (await ctx.p()).goto(url);
      return { ok: true };
    },
  };
}
