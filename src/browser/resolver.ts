import type { Page, Locator, FrameLocator } from 'playwright';

export type Query = string;

export function detectKind(q: string): 'xpath' | 'css' | 'text' {
  const s = q.trim();
  if (s.startsWith('//') || s.startsWith('(/') || s.startsWith('/html')) return 'xpath';
  if (/^xpath=/.test(s)) return 'xpath';
  if (/[#.\[\]>]|::/.test(s) || /^[a-z]+\[/i.test(s)) return 'css';
  return 'text';
}

export function resolve(page: Page, query: Query): Locator {
  const kind = detectKind(query);
  if (kind === 'xpath') return page.locator(query.replace(/^xpath=/, ''));
  if (kind === 'css') return page.locator(query);
  return page
    .getByRole('button', { name: query, exact: false })
    .or(page.getByRole('link', { name: query, exact: false }))
    .or(page.getByLabel(query, { exact: false }))
    .or(page.getByPlaceholder(query, { exact: false }))
    .or(page.getByText(query, { exact: false }))
    .first();
}

export async function resolveVisible(page: Page, query: Query, timeout = 8000): Promise<Locator> {
  const loc = resolve(page, query);
  await loc.waitFor({ state: 'visible', timeout });
  return loc;
}
