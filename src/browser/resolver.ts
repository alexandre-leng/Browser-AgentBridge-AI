import type { Page, Locator } from 'playwright';

export type Query = string;

export function detectKind(q: any): 'xpath' | 'css' | 'text' {
  if (q === undefined || q === null || q === '') {
    throw new Error('Query is required for element resolution');
  }
  const s = String(q).trim();
  if (s.startsWith('css=')) return 'css';
  if (s.startsWith('text=')) return 'text';
  if (s.startsWith('//') || s.startsWith('(/') || s.startsWith('/html')) return 'xpath';
  if (/^xpath=/.test(s)) return 'xpath';
  if (/^[#.]/.test(s) && s.length > 1) return 'css';
  if (/[\[\]>]|::/.test(s) || /^[a-z]+\[/i.test(s)) return 'css';
  
  const knownTags = new Set(['html', 'body', 'div', 'span', 'a', 'button', 'input', 'form', 'textarea', 'select', 'img', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'ul', 'ol', 'section', 'nav', 'article', 'aside', 'header', 'footer']);
  if (knownTags.has(s.toLowerCase())) return 'css';
  
  return 'text';
}

export function resolve(page: Page, query: Query): Locator {
  const kind = detectKind(query);
  if (kind === 'xpath') return page.locator(query.replace(/^xpath=/, ''));
  if (kind === 'css') return page.locator(query.replace(/^css=/, ''));
  
  const txt = query.replace(/^text=/, '');
  return page
    .getByRole('button', { name: txt, exact: false })
    .or(page.getByRole('link', { name: txt, exact: false }))
    .or(page.getByLabel(txt, { exact: false }))
    .or(page.getByPlaceholder(txt, { exact: false }))
    .or(page.getByText(txt, { exact: false }))
    .first();
}

export async function resolveVisible(page: Page, query: Query, timeout = 8000): Promise<Locator> {
  const loc = resolve(page, query);
  await loc.waitFor({ state: 'visible', timeout });
  return loc;
}
