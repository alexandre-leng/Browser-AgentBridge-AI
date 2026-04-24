import type { Page } from 'playwright';

export interface AgentElement {
  id: number;
  role: string;
  name: string;
  tag: string;
  box: { x: number; y: number; w: number; h: number };
}

// Per-session cache of last annotated elements so agent.click {ref:3} works after page.annotate
let _cache: AgentElement[] = [];

export function getAgentElements() {
  return _cache;
}

export function findByRef(ref: string | number): AgentElement | null {
  if (typeof ref === 'number') {
    return _cache.find((e) => e.id === ref) ?? null;
  }
  const q = ref.toLowerCase().trim();
  return (
    _cache.find((e) => e.name.toLowerCase() === q) ??
    _cache.find((e) => e.name.toLowerCase().includes(q)) ??
    _cache.find((e) => e.role.toLowerCase() === q) ??
    null
  );
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
async function collectElements(page: Page): Promise<AgentElement[]> {
  return page.evaluate((sel: string) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const seen = new Set<string>();
    const result: any[] = [];
    let id = 1;
    for (const el of Array.from(document.querySelectorAll(sel))) {
      const r = el.getBoundingClientRect();
      // Skip invisible or off-screen
      if (r.width < 4 || r.height < 4) continue;
      if (r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh) continue;
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
        id: id++,
        role,
        name: name.trim(),
        tag,
        box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      });
    }
    return result;
  }, INTERACTIVE_SEL);
}

const OVERLAY_ATTR = '__oc_agent_overlay__';

/** Inject numbered bounding-box overlay, take screenshot, remove overlay. */
export async function annotateInteractive(page: Page): Promise<{ elements: AgentElement[]; imageB64: string }> {
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

  _cache = elements;
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
