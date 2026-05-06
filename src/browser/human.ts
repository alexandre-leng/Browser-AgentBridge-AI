import type { Page } from 'playwright';

export const rand = (min: number, max: number) => min + Math.random() * (max - min);
export const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1));
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface HumanTimingProfile {
  consultSpeed: number;
  focusedWpmMin: number;
  focusedWpmMax: number;
  skimWpmMin: number;
  skimWpmMax: number;
  minFocusedMs: number;
  maxFocusedMs: number;
  minSkimMs: number;
  maxSkimMs: number;
  feedbackIntervalMs: number;
}

const DEFAULT_TIMING_PROFILE: HumanTimingProfile = {
  consultSpeed: Math.max(0.25, Number(process.env.BRIDGE_HUMAN_CONSULT_SPEED ?? process.env.BRIDGE_DEMO_SPEED ?? 1)),
  focusedWpmMin: 165,
  focusedWpmMax: 230,
  skimWpmMin: 210,
  skimWpmMax: 320,
  minFocusedMs: 1800,
  maxFocusedMs: 45_000,
  minSkimMs: 900,
  maxSkimMs: 18_000,
  feedbackIntervalMs: 1200,
};

let timingProfile: HumanTimingProfile = { ...DEFAULT_TIMING_PROFILE };

const CURSOR_ID = '__openclaw_demo_cursor__';
const CURSOR_STYLE_ID = '__openclaw_demo_cursor_style__';

function demoSlowdown() {
  return Math.max(0.25, Number(process.env.BRIDGE_DEMO_SPEED ?? 1));
}

function consultationSlowdown() {
  return timingProfile.consultSpeed;
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

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function getHumanTimingProfile() {
  return { ...timingProfile };
}

export function updateHumanTimingProfile(patch: Partial<HumanTimingProfile>) {
  timingProfile = {
    consultSpeed: clampNumber(patch.consultSpeed, 0.25, 8, timingProfile.consultSpeed),
    focusedWpmMin: clampNumber(patch.focusedWpmMin, 80, 500, timingProfile.focusedWpmMin),
    focusedWpmMax: clampNumber(patch.focusedWpmMax, 80, 650, timingProfile.focusedWpmMax),
    skimWpmMin: clampNumber(patch.skimWpmMin, 100, 700, timingProfile.skimWpmMin),
    skimWpmMax: clampNumber(patch.skimWpmMax, 100, 850, timingProfile.skimWpmMax),
    minFocusedMs: clampNumber(patch.minFocusedMs, 0, 120_000, timingProfile.minFocusedMs),
    maxFocusedMs: clampNumber(patch.maxFocusedMs, 500, 180_000, timingProfile.maxFocusedMs),
    minSkimMs: clampNumber(patch.minSkimMs, 0, 60_000, timingProfile.minSkimMs),
    maxSkimMs: clampNumber(patch.maxSkimMs, 500, 120_000, timingProfile.maxSkimMs),
    feedbackIntervalMs: clampNumber(patch.feedbackIntervalMs, 250, 10_000, timingProfile.feedbackIntervalMs),
  };
  if (timingProfile.focusedWpmMin > timingProfile.focusedWpmMax) {
    [timingProfile.focusedWpmMin, timingProfile.focusedWpmMax] = [timingProfile.focusedWpmMax, timingProfile.focusedWpmMin];
  }
  if (timingProfile.skimWpmMin > timingProfile.skimWpmMax) {
    [timingProfile.skimWpmMin, timingProfile.skimWpmMax] = [timingProfile.skimWpmMax, timingProfile.skimWpmMin];
  }
  if (timingProfile.minFocusedMs > timingProfile.maxFocusedMs) timingProfile.maxFocusedMs = timingProfile.minFocusedMs;
  if (timingProfile.minSkimMs > timingProfile.maxSkimMs) timingProfile.maxSkimMs = timingProfile.minSkimMs;
  return getHumanTimingProfile();
}

export function resetHumanTimingProfile() {
  timingProfile = { ...DEFAULT_TIMING_PROFILE };
  return getHumanTimingProfile();
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
  // 60ms green flash (was 120ms) — still perceptible, doesn't block the next action.
  await sleep(60 * demoSlowdown());
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
    // Smoothstep: ease-in-out — humans accelerate to mid-trajectory, then decelerate.
    // Linear t was a strong bot-detection signal (constant velocity).
    const tLin = i / steps;
    const t = tLin * tLin * (3 - 2 * tLin);
    const x = bezier(t, fromX, cx1, cx2, toX) + rand(-0.5, 0.5);
    const y = bezier(t, fromY, cy1, cy2, toY) + rand(-0.5, 0.5);
    await page.mouse.move(x, y);
    // Throttle the visible cursor paint to every 3rd step. The CSS has
    // `transition: transform 40ms linear`, so the browser interpolates between
    // updates — saves ~2/3 of the IPC round-trips with no visual difference.
    if (i % 3 === 0 || i === steps) await paintCursor(page, x, y);
    // Fast-typer profile: 4-10ms per step (was 8-18). A real human moves the
    // cursor at 600-1200 px/s; with ~7px steps that's 6-12ms — match it.
    await sleep(rand(4, 10) * demoSlowdown());
  }
  _curX = toX;
  _curY = toY;
  await paintCursor(page, toX, toY);
}

// QWERTY neighbor map — used to simulate occasional typos. Typing the wrong
// neighbor key, then backspacing, is one of the strongest "human" signals
// against keystroke-pattern bot detectors (which see uniform timing + zero errors).
const KEYBOARD_NEIGHBORS: Record<string, string> = {
  q: 'w', w: 'e', e: 'r', r: 't', t: 'y', y: 'u', u: 'i', i: 'o', o: 'p',
  a: 's', s: 'd', d: 'f', f: 'g', g: 'h', h: 'j', j: 'k', k: 'l',
  z: 'x', x: 'c', c: 'v', v: 'b', b: 'n', n: 'm',
};
function neighborKey(ch: string): string {
  const lower = ch.toLowerCase();
  const neighbor = KEYBOARD_NEIGHBORS[lower];
  if (!neighbor) return ch;
  return ch === lower ? neighbor : neighbor.toUpperCase();
}

export async function humanType(page: Page, text: string) {
  for (const ch of text) {
    // Fast-typer profile (90-110 WPM): bursts of quick keystrokes with rare
    // corrections. ~1.5% typo rate (down from 2.5%) — too many corrections look
    // like a struggling user, not a confident one.
    if (Math.random() < 0.015 && /[a-z]/i.test(ch)) {
      await page.keyboard.type(neighborKey(ch), { delay: 0 });
      await sleep(rand(60, 140));
      await page.keyboard.press('Backspace');
      await sleep(rand(40, 90));
    }
    await page.keyboard.type(ch, { delay: 0 });
    // 18-70 ms per char ≈ 90-110 WPM (fast typer). Was 40-160 ms (40-60 WPM).
    await sleep(rand(18, 70));
    // Occasional micro-thinking pause — kept rare so it doesn't break rhythm.
    if (Math.random() < 0.02) await sleep(rand(120, 280));
  }
}

export async function humanScroll(page: Page, deltaY: number, deltaX = 0) {
  await ensureVisibleCursor(page);
  const viewport = page.viewportSize();
  const targetX = viewport ? Math.round(viewport.width * rand(0.38, 0.62)) : _curX;
  const targetY = viewport ? Math.round(viewport.height * rand(0.48, 0.72)) : _curY;
  if (Math.hypot(targetX - _curX, targetY - _curY) > 80) await humanMove(page, targetX, targetY);
  const steps = randInt(7, 13);
  // Wheel inertia: real mouse-wheel scrolls front-load the delta then taper off
  // (exponential decay). Constant deltaY/steps was a bot signal.
  const weights = Array.from({ length: steps }, (_, i) => Math.exp(-1.2 * (i / steps)));
  const sumW = weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < steps; i++) {
    const w = weights[i] / sumW;
    const dx = deltaX !== 0 ? deltaX * w + rand(-2, 2) : 0;
    const dy = deltaY !== 0 ? deltaY * w + rand(-8, 8) : 0;
    await page.mouse.wheel(dx, dy);
    // Same throttle logic as humanMove: paint every other step.
    if (i % 2 === 0 || i === steps - 1) {
      await paintCursor(page, _curX + rand(-4, 4), _curY + rand(-4, 4));
    }
    // Fast scroll: 50-130 ms between wheel impulses (was 120-260). A real wheel
    // flick fires ~5-10 events in under a second — match that rhythm.
    await sleep(rand(50, 130) * demoSlowdown());
  }
}

export async function humanJitter(page: Page, radius = 18, moves = 4) {
  await ensureVisibleCursor(page);
  const safeMoves = Math.max(1, Math.min(Math.round(moves), 20));
  for (let i = 0; i < safeMoves; i++) {
    await humanMove(page, _curX + rand(-radius, radius), _curY + rand(-radius, radius));
    // Fast: 30-110 ms between micro-jitter (was 70-220).
    await sleep(rand(30, 110) * demoSlowdown());
  }
}

export async function humanIdle(page: Page, durationMs = 1800) {
  const end = Date.now() + Math.max(0, durationMs);
  const viewport = page.viewportSize() ?? { width: 1280, height: 800 };
  while (Date.now() < end) {
    const x = randInt(80, Math.max(100, viewport.width - 80));
    const y = randInt(90, Math.max(120, viewport.height - 120));
    await humanMove(page, x, y);
    if (Math.random() < 0.3) await humanJitter(page, randInt(8, 22), randInt(2, 5));
    await sleep(rand(450, 1300) * demoSlowdown());
  }
}

export async function humanSkim(page: Page, steps = 4, amount = 420) {
  const safeSteps = Math.max(1, Math.min(Math.round(steps), 20));
  for (let i = 0; i < safeSteps; i++) {
    if (Math.random() < 0.35) await humanJitter(page, randInt(10, 26), randInt(2, 4));
    await humanScroll(page, amount * rand(0.65, 1.25));
    await sleep(rand(700, 1800) * demoSlowdown());
    if (Math.random() < 0.18) {
      await humanScroll(page, -amount * rand(0.15, 0.45));
      await sleep(rand(400, 900) * demoSlowdown());
    }
  }
}

export async function humanPreClick(page: Page, x: number, y: number) {
  // Confident-user profile: target acquisition without dwelling.
  // Old: 270-880 ms total dwell + 45% jitter chance.
  // New:  60-220 ms total dwell + 15% jitter chance — "tac tac tac" rhythm.
  await humanMove(page, x + rand(-8, 8), y + rand(-5, 5));
  await humanPause(40, 140);
  if (Math.random() < 0.15) await humanJitter(page, randInt(3, 8), 1);
  await humanMove(page, x, y);
  await humanPause(20, 80);
}

export function estimateHumanConsultationMs(text: string, options: { focused?: boolean } = {}) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const words = normalized ? normalized.split(' ').length : 0;
  const punctuationPauses = (normalized.match(/[.!?;:]/g) ?? []).length;
  const wpm = options.focused
    ? rand(timingProfile.focusedWpmMin, timingProfile.focusedWpmMax)
    : rand(timingProfile.skimWpmMin, timingProfile.skimWpmMax);
  const baseMs = (words / wpm) * 60_000;
  const scanMs = Math.min(normalized.length * rand(6, 14), 10_000);
  const pauseMs = punctuationPauses * rand(90, 220);
  const minimumMs = options.focused
    ? rand(timingProfile.minFocusedMs, Math.max(timingProfile.minFocusedMs, timingProfile.minFocusedMs + 1400))
    : rand(timingProfile.minSkimMs, Math.max(timingProfile.minSkimMs, timingProfile.minSkimMs + 900));
  const maximumMs = options.focused ? timingProfile.maxFocusedMs : timingProfile.maxSkimMs;
  return Math.round(Math.max(minimumMs, Math.min(maximumMs, baseMs + scanMs + pauseMs)) * consultationSlowdown());
}

export async function humanConsult(
  page: Page,
  text: string,
  options: { focused?: boolean; reason?: string; onFeedback?: (event: Record<string, unknown>) => void } = {},
) {
  const durationMs = estimateHumanConsultationMs(text, options);
  const startedAt = Date.now();
  const slices = Math.max(1, Math.min(12, Math.round(durationMs / timingProfile.feedbackIntervalMs)));
  for (let i = 0; i < slices; i++) {
    const elapsedMs = Date.now() - startedAt;
    options.onFeedback?.({
      phase: 'consulting',
      reason: options.reason ?? 'reading',
      elapsedMs,
      remainingMs: Math.max(0, durationMs - elapsedMs),
      progress: Math.min(1, elapsedMs / Math.max(1, durationMs)),
      timing: getHumanTimingProfile(),
    });
    if (Math.random() < 0.45) await humanJitter(page, randInt(5, 18), randInt(1, 3));
    await sleep((durationMs / slices) * rand(0.82, 1.18));
  }
  options.onFeedback?.({
    phase: 'consulted',
    reason: options.reason ?? 'reading',
    elapsedMs: Date.now() - startedAt,
    remainingMs: 0,
    progress: 1,
    timing: getHumanTimingProfile(),
  });
  return durationMs;
}

/**
 * Default pause between actions. Fast-typer profile: 100-300 ms instead of
 * 300-900 ms. Callers that explicitly pass min/max keep their own ranges.
 */
export async function humanPause(minMs = 100, maxMs = 300) {
  await sleep(rand(minMs, maxMs));
}
