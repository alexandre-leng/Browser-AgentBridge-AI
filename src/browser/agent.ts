import type { Page, Frame } from 'playwright';

export interface AgentElement {
  id: number;
  role: string;
  name: string;
  tag: string;
  box: { x: number; y: number; w: number; h: number };
}

// Per-session cache of last annotated elements so agent.click {ref:3} works after page.annotate
const _cache = new Map<string, AgentElement[]>();

export function getAgentElements(sessionId: string = 'default') {
  return _cache.get(sessionId) ?? [];
}

function levenshtein(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

function scoreMatch(el: AgentElement, query: string): number {
  const q = query.toLowerCase();
  const name = el.name.toLowerCase();
  const role = el.role.toLowerCase();
  
  if (name === q) return 100;
  if (name.includes(q)) return 80;
  if (role === q) return 60;
  
  const dist = levenshtein(name, q);
  if (dist <= 3) return 70 - dist * 10;
  return 0;
}

export function findByRef(ref: string | number, sessionId: string = 'default'): AgentElement | null {
  const cache = getAgentElements(sessionId);
  if (typeof ref === 'number') {
    return cache.find((e) => e.id === ref) ?? null;
  }
  const q = ref.toLowerCase().trim();
  
  let bestMatch: AgentElement | null = null;
  let highestScore = 0;
  
  for (const el of cache) {
    const score = scoreMatch(el, q);
    if (score > highestScore) {
      highestScore = score;
      bestMatch = el;
    }
  }
  
  return highestScore >= 60 ? bestMatch : null;
}

export function findSimilar(query: string, sessionId: string = 'default', limit = 5): AgentElement[] {
  const cache = getAgentElements(sessionId);
  const q = query.toLowerCase().trim();
  
  return cache
    .map(el => ({ el, score: scoreMatch(el, q) }))
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(m => m.el);
}

const INTERACTIVE_SEL = [
  'a[href]',
  'a:not([href])',
  'button:not([disabled])',
  'input:not([type="hidden"]):not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[onclick]',
  '[jsaction]',
  '[data-href]',
  '[data-url]',
  '[data-link]',
  '[data-testid*="link" i]',
  '[data-testid*="card" i]',
  '[data-testid*="listing" i]',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[role="option"]',
  '[role="combobox"]',
  '[role="searchbox"]',
  '[role="textbox"]',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

async function ensureEvaluateNameHelper(frame: Frame) {
  await frame.evaluate(`(() => {
    if (typeof globalThis.__name !== 'function') {
      Object.defineProperty(globalThis, '__name', {
        value: function (fn) { return fn; },
        writable: true,
        configurable: true
      });
    }
  })()`).catch(() => {});
}

/** Collect all in-viewport interactive elements with bounding boxes + accessible names. */
async function collectElementsRecursive(frame: Frame, offset = { x: 0, y: 0 }, context = { id: 1 }): Promise<AgentElement[]> {
  await ensureEvaluateNameHelper(frame);
  const elements = await frame.evaluate(({ sel, offset }) => {
    const seen = new Set<string>();
    const result: any[] = [];

    const isDisabled = (el: Element) =>
      el.hasAttribute('disabled') ||
      el.getAttribute('aria-disabled') === 'true' ||
      (el as HTMLInputElement).disabled === true;

    const hasClickHandler = (el: Element) => {
      const h = el as HTMLElement & { onclick?: unknown };
      const attrs = el.getAttributeNames();
      return (
        typeof h.onclick === 'function' ||
        attrs.some((attr) => attr.startsWith('on') || attr === 'jsaction') ||
        ['data-href', 'data-url', 'data-link', 'data-action', 'data-testid'].some((attr) => el.hasAttribute(attr))
      );
    };

    const looksLikeVisibleLink = (el: Element, style: CSSStyleDeclaration) => {
      const h = el as HTMLElement;
      const text = h.innerText?.trim() || h.getAttribute('aria-label') || h.getAttribute('title') || '';
      const role = h.getAttribute('role');
      const tag = el.tagName.toLowerCase();
      const tabIndex = h.tabIndex;
      const hasNavigationData = ['href', 'data-href', 'data-url', 'data-link'].some((attr) => el.hasAttribute(attr));
      const pointer = style.cursor === 'pointer';
      const classSignal = /link|card|tile|item|listing|result|click|nav/i.test(String(h.className || ''));
      const idSignal = /link|card|tile|item|listing|result|click|nav/i.test(h.id || '');
      return (
        tag === 'a' ||
        role === 'link' ||
        role === 'button' ||
        hasNavigationData ||
        hasClickHandler(el) ||
        (pointer && (text.length > 0 || tabIndex >= 0 || classSignal || idSignal))
      );
    };

    const directMatches = Array.from(document.querySelectorAll(sel));
    const visualMatches = Array.from(document.querySelectorAll('body *')).filter((el) => {
      if (directMatches.includes(el)) return false;
      if (isDisabled(el)) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      return looksLikeVisibleLink(el, style);
    });

    for (const el of [...directMatches, ...visualMatches]) {
      // Skip invisible or off-screen
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
      if (el.getAttribute('aria-hidden') === 'true') continue;
      if (isDisabled(el)) continue;
      
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      
      // Dedup by position
      const key = `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      
      const h = el as HTMLElement;
      const labelledById = h.getAttribute('aria-labelledby');
      const labelText = labelledById ? (document.getElementById(labelledById)?.innerText?.trim() ?? '') : '';
      const name =
        h.getAttribute('aria-label') ||
        (el as HTMLInputElement).placeholder ||
        h.getAttribute('title') ||
        labelText ||
        h.innerText?.trim().replace(/\s+/g, ' ').slice(0, 80) ||
        el.getAttribute('name') ||
        el.getAttribute('id') ||
        '';
      const tag = el.tagName.toLowerCase();
      const role = h.getAttribute('role') || (looksLikeVisibleLink(el, style) && !['button', 'input', 'select', 'textarea'].includes(tag) ? 'link' : tag);
      
      result.push({
        role,
        name: name.trim(),
        tag,
        box: { 
          x: Math.round(r.x + offset.x), 
          y: Math.round(r.y + offset.y), 
          w: Math.round(r.width), 
          h: Math.round(r.height) 
        },
      });
    }
    return result;
  }, { sel: INTERACTIVE_SEL, offset });

  for (const el of elements) {
    el.id = context.id++;
  }

  let allElements = [...elements];
  
  for (const child of frame.childFrames()) {
    try {
      const handle = await child.frameElement();
      const box = await handle.boundingBox();
      if (box) {
        // Only recurse if the iframe itself is somewhat visible
        const childElements = await collectElementsRecursive(child, { x: offset.x + box.x, y: offset.y + box.y }, context);
        allElements = allElements.concat(childElements);
      }
    } catch {
      // Ignore frame access errors
    }
  }

  return allElements;
}

export async function collectElements(page: Page): Promise<AgentElement[]> {
  return collectElementsRecursive(page.mainFrame());
}

const OVERLAY_ATTR = '__oc_agent_overlay__';

/**
 * Annotate interactive elements on the page and return a screenshot with numbered
 * bounding boxes plus the element list. Steps:
 * 1. Collect elements (main frame + iframes, recursive — coords are already absolute).
 * 2. Inject overlay on the main frame.
 * 3. Take screenshot.
 * 4. Remove overlay (fire-and-forget — next call would clean it up anyway).
 *
 * Step 4 used to be awaited (~30-50 ms wasted). The overlay self-cleans on the next
 * annotate via the `document.querySelectorAll([attr]).remove()` at the top of the
 * draw step, so the async cleanup is purely cosmetic until then.
 */
export async function annotateInteractive(page: Page, sessionId: string = 'default'): Promise<{ elements: AgentElement[]; imageB64: string }> {
  const elements = await collectElements(page);

  await ensureEvaluateNameHelper(page.mainFrame());
  await page.evaluate(
    ({ els, attr }: { els: AgentElement[]; attr: string }) => {
      document.querySelectorAll(`[${attr}]`).forEach((e) => e.remove());
      const root = document.createElement('div');
      root.setAttribute(attr, '1');
      root.style.cssText =
        'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2147483647;font-family:system-ui';
      for (const el of els) {
        const { x, y, w, h } = el.box;
        const wrap = document.createElement('div');
        wrap.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;outline:2px solid rgba(74,222,128,0.9);background:rgba(74,222,128,0.06);box-sizing:border-box`;
        const badge = document.createElement('span');
        badge.textContent = String(el.id);
        badge.style.cssText =
          'position:absolute;top:-1px;left:-1px;background:#4ade80;color:#000;font:bold 10px/15px system-ui;padding:0 3px;border-radius:2px;line-height:15px;white-space:nowrap';
        wrap.appendChild(badge);
        root.appendChild(wrap);
      }
      document.documentElement.appendChild(root);
    },
    { els: elements, attr: OVERLAY_ATTR },
  );

  const buf = await page.screenshot({ type: 'jpeg', quality: 78, fullPage: false });

  // Fire-and-forget: caller doesn't need to wait for DOM cleanup.
  page
    .evaluate((attr: string) => {
      document.querySelectorAll(`[${attr}]`).forEach((e) => e.remove());
    }, OVERLAY_ATTR)
    .catch(() => {
      /* page may have navigated; next annotate will clean */
    });

  _cache.set(sessionId, elements);
  return { elements, imageB64: buf.toString('base64') };
}

/**
 * Compact aria tree built from DOM (role + name, no bounding boxes).
 * Returns `{ items, total }` so callers can show a real count even when limit < total.
 * Stopping early in the page-side `evaluate` avoids serializing an unused tail.
 */
export async function accessibilityTree(
  page: Page,
  opts: { limit?: number } = {},
): Promise<{ items: { role: string; name: string }[]; total: number }> {
  const limit = Math.max(1, opts.limit ?? 200);
  return page.evaluate((max) => {
    const ROLES = ['button', 'link', 'textbox', 'searchbox', 'checkbox', 'radio', 'combobox',
      'listbox', 'option', 'menuitem', 'tab', 'heading', 'img', 'list', 'listitem'];
    const sel = ROLES.map((r) => `[role="${r}"]`).join(', ') +
      ', a[href], button, input:not([type="hidden"]), select, textarea, h1, h2, h3';
    const all = document.querySelectorAll(sel);
    const total = all.length;
    const items: { role: string; name: string }[] = [];
    for (let i = 0; i < all.length && items.length < max; i++) {
      const el = all[i];
      const h = el as HTMLElement;
      const role = h.getAttribute('role') || el.tagName.toLowerCase();
      const name = h.getAttribute('aria-label') ||
        (el as HTMLInputElement).placeholder ||
        h.innerText?.trim().replace(/\s+/g, ' ').slice(0, 100) || '';
      items.push({ role, name });
    }
    return { items, total };
  }, limit);
}
