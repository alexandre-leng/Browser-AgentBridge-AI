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
  
  return highestScore > 0 ? bestMatch : null;
}

const INTERACTIVE_SEL = [
  'a[href]',
  'button:not([disabled])',
  'input:not([type="hidden"]):not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
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

/** Collect all in-viewport interactive elements with bounding boxes + accessible names. */
async function collectElementsRecursive(frame: Frame, offset = { x: 0, y: 0 }, context = { id: 1 }): Promise<AgentElement[]> {
  const elements = await frame.evaluate(({ sel, offset }) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const seen = new Set<string>();
    const result: any[] = [];
    
    for (const el of Array.from(document.querySelectorAll(sel))) {
      const r = el.getBoundingClientRect();
      // Skip invisible or off-screen (relative to current frame)
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
      const role = h.getAttribute('role') || tag;
      
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
    } catch (e) {
      // Ignore frame access errors
    }
  }

  return allElements;
}

export async function collectElements(page: Page): Promise<AgentElement[]> {
  return collectElementsRecursive(page.mainFrame());
}

const OVERLAY_ATTR = '__oc_agent_overlay__';

/** Inject numbered bounding-box overlay, take screenshot, remove overlay. */
export async function annotateInteractive(page: Page, sessionId: string = 'default'): Promise<{ elements: AgentElement[]; imageB64: string }> {
  const elements = await collectElements(page);

  // Draw overlay
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

  await page.evaluate((attr: string) => {
    document.querySelectorAll(`[${attr}]`).forEach((e) => e.remove());
  }, OVERLAY_ATTR);

  _cache.set(sessionId, elements);
  return { elements, imageB64: buf.toString('base64') };
}

/** Compact aria tree built from DOM (role + name, no bounding boxes). */
export async function accessibilityTree(page: Page) {
  return page.evaluate(() => {
    const ROLES = ['button', 'link', 'textbox', 'searchbox', 'checkbox', 'radio', 'combobox',
      'listbox', 'option', 'menuitem', 'tab', 'heading', 'img', 'list', 'listitem'];
    const sel = ROLES.map((r) => `[role="${r}"]`).join(', ') +
      ', a[href], button, input:not([type="hidden"]), select, textarea, h1, h2, h3';
    return Array.from(document.querySelectorAll(sel)).slice(0, 200).map((el) => {
      const h = el as HTMLElement;
      const role = h.getAttribute('role') || el.tagName.toLowerCase();
      const name = h.getAttribute('aria-label') ||
        (el as HTMLInputElement).placeholder ||
        h.innerText?.trim().replace(/\s+/g, ' ').slice(0, 100) || '';
      return { role, name };
    });
  });
}
