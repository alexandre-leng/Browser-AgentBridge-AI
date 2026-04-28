import type { Page } from 'playwright';

export const rand = (min: number, max: number) => min + Math.random() * (max - min);
export const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1));
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const CURSOR_ID = '__openclaw_demo_cursor__';
const CURSOR_STYLE_ID = '__openclaw_demo_cursor_style__';

function demoSlowdown() {
  return Math.max(0.25, Number(process.env.BRIDGE_DEMO_SPEED ?? 1));
}

function isCursorEnabled() {
  return process.env.BRIDGE_VISIBLE_CURSOR !== '0';
}

// Track real cursor position so every move starts from the last known point.
let _curX = 0;
let _curY = 0;

export function getCursorPos() {
  return { x: _curX, y: _curY };
}
export function setCursorPos(x: number, y: number) {
  _curX = x;
  _curY = y;
}

function bezier(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const u = 1 - t;
  return u ** 3 * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t ** 3 * p3;
}

export async function ensureVisibleCursor(page: Page) {
  if (!isCursorEnabled()) return;
  if (typeof (page as any).evaluate !== 'function') return;
  await page.evaluate(({ cursorId, styleId }) => {
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        #${cursorId} {
          position: fixed;
          left: 0;
          top: 0;
          width: 18px;
          height: 18px;
          pointer-events: none;
          z-index: 2147483647;
          transform: translate3d(-50%, -50%, 0);
          transition: transform 40ms linear, box-shadow 120ms ease, background 120ms ease;
          border: 2px solid #fff;
          border-radius: 999px;
          background: #ff3b30;
          box-shadow: 0 0 0 2px #111, 0 8px 24px rgba(0,0,0,.35);
          mix-blend-mode: normal;
        }
        #${cursorId}.clicking {
          background: #34c759;
          box-shadow: 0 0 0 4px rgba(52,199,89,.45), 0 0 0 2px #111, 0 8px 24px rgba(0,0,0,.35);
        }
      `;
      document.documentElement.appendChild(style);
    }
    if (!document.getElementById(cursorId)) {
      const cursor = document.createElement('div');
      cursor.id = cursorId;
      cursor.setAttribute('aria-hidden', 'true');
      document.documentElement.appendChild(cursor);
    }
  }, { cursorId: CURSOR_ID, styleId: CURSOR_STYLE_ID }).catch(() => {});
}

async function paintCursor(page: Page, x: number, y: number, clicking = false) {
  if (!isCursorEnabled()) return;
  if (typeof (page as any).evaluate !== 'function') return;
  await ensureVisibleCursor(page);
  await page.evaluate(({ cursorId, x, y, clicking }) => {
    const cursor = document.getElementById(cursorId);
    if (!cursor) return;
    cursor.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    cursor.classList.toggle('clicking', clicking);
  }, { cursorId: CURSOR_ID, x, y, clicking }).catch(() => {});
}

export async function flashClick(page: Page, x = _curX, y = _curY) {
  await paintCursor(page, x, y, true);
  await sleep(120 * demoSlowdown());
  await paintCursor(page, x, y, false);
}

export async function humanMove(page: Page, toX: number, toY: number, fromX = _curX, fromY = _curY) {
  await ensureVisibleCursor(page);
  const dist = Math.hypot(toX - fromX, toY - fromY);
  const steps = Math.max(24, Math.min(90, Math.floor(dist / 7)));
  const arc = Math.min(150, dist * 0.3);
  const cx1 = fromX + (toX - fromX) * 0.3 + rand(-arc, arc);
  const cy1 = fromY + (toY - fromY) * 0.3 + rand(-arc, arc);
  const cx2 = fromX + (toX - fromX) * 0.7 + rand(-arc, arc);
  const cy2 = fromY + (toY - fromY) * 0.7 + rand(-arc, arc);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = bezier(t, fromX, cx1, cx2, toX) + rand(-0.5, 0.5);
    const y = bezier(t, fromY, cy1, cy2, toY) + rand(-0.5, 0.5);
    await page.mouse.move(x, y);
    await paintCursor(page, x, y);
    await sleep(rand(8, 18) * demoSlowdown());
  }
  _curX = toX;
  _curY = toY;
  await paintCursor(page, toX, toY);
}

export async function humanType(page: Page, text: string) {
  for (const ch of text) {
    await page.keyboard.type(ch, { delay: 0 });
    await sleep(rand(40, 160));
    if (Math.random() < 0.03) await sleep(rand(200, 500));
  }
}

export async function humanScroll(page: Page, deltaY: number, deltaX = 0) {
  await ensureVisibleCursor(page);
  const viewport = page.viewportSize();
  const targetX = viewport ? Math.round(viewport.width * rand(0.38, 0.62)) : _curX;
  const targetY = viewport ? Math.round(viewport.height * rand(0.48, 0.72)) : _curY;
  if (Math.hypot(targetX - _curX, targetY - _curY) > 80) await humanMove(page, targetX, targetY);
  const steps = randInt(7, 13);
  for (let i = 0; i < steps; i++) {
    const dx = deltaX !== 0 ? deltaX / steps + rand(-2, 2) : 0;
    const dy = deltaY !== 0 ? deltaY / steps + rand(-10, 10) : 0;
    await page.mouse.wheel(dx, dy);
    await paintCursor(page, _curX + rand(-4, 4), _curY + rand(-4, 4));
    await sleep(rand(120, 260) * demoSlowdown());
  }
}

export async function humanPause(minMs = 300, maxMs = 900) {
  await sleep(rand(minMs, maxMs));
}
