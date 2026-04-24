import type { Page } from 'playwright';

export const rand = (min: number, max: number) => min + Math.random() * (max - min);
export const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1));
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

export async function humanMove(page: Page, toX: number, toY: number, fromX = _curX, fromY = _curY) {
  const dist = Math.hypot(toX - fromX, toY - fromY);
  const steps = Math.max(20, Math.min(60, Math.floor(dist / 8)));
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
    await sleep(rand(2, 8));
  }
  _curX = toX;
  _curY = toY;
}

export async function humanType(page: Page, text: string) {
  for (const ch of text) {
    await page.keyboard.type(ch, { delay: 0 });
    await sleep(rand(40, 160));
    if (Math.random() < 0.03) await sleep(rand(200, 500));
  }
}

export async function humanScroll(page: Page, deltaY: number) {
  const steps = randInt(4, 8);
  const perStep = deltaY / steps;
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, perStep + rand(-10, 10));
    await sleep(rand(60, 160));
  }
}

export async function humanPause(minMs = 300, maxMs = 900) {
  await sleep(rand(minMs, maxMs));
}
