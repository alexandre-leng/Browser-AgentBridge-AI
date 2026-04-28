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
  };
}
