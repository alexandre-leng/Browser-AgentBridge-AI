import type { Page } from 'playwright';
import { humanMove, humanPause, humanScroll, randInt, sleep } from './human.js';

const DEFAULT_MIN_DELAY_MS = 12000;
const WARMUP_REUSE_WINDOW_MS = 60_000;

const lastByHost = new Map<string, number>();
const lastNavigationByHost = new Map<string, { url: string; at: number }>();
const lastWarmupByHost = new Map<string, number>();

/**
 * Hosts known to react badly to fast browsing. Populated on the fly when
 * `assertNoAntiBot` detects a verification page; can be pre-seeded via
 * `BRIDGE_POLITE_FORCE_HOSTS=google.com,linkedin.com`.
 *
 * Adaptive policy: hosts not in this set get 0 ms delay between navigations.
 * Hosts in the set are throttled to `BRIDGE_POLITE_MIN_DELAY_MS` (12 s default).
 */
const aggressiveHosts = new Set<string>(
  (process.env.BRIDGE_POLITE_FORCE_HOSTS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

export function markHostAggressive(host: string) {
  if (host) aggressiveHosts.add(host.toLowerCase());
}

export function isHostAggressive(host: string) {
  return aggressiveHosts.has(host.toLowerCase());
}

const ANTI_BOT_PATTERNS = [
  /pourquoi cette vérification/i,
  /vous surfez et cliquez à une vitesse surhumaine/i,
  /un robot est sur le même réseau/i,
  /difficultés pour accéder au site/i,
  /captcha/i,
  /are you human/i,
  /verify you are human/i,
  /access denied/i,
];

const DIRECT_APP_SEARCH_PATTERNS = [
  /\/search(?:[/?#]|$)/i,
  /\/s\/[^/?#]+\/homes/i,
  /\/recherche(?:[/?#]|$)/i,
];

const COOKIE_ACTIONS = [
  { kind: 'necessary', selector: 'button:has-text("Uniquement les cookies nécessaires")' },
  { kind: 'necessary', selector: 'button:has-text("Tout refuser")' },
  { kind: 'necessary', selector: 'button:has-text("Refuser")' },
  { kind: 'necessary', selector: 'button:has-text("Reject all")' },
  { kind: 'necessary', selector: 'button:has-text("Only necessary")' },
  { kind: 'accept', selector: 'button:has-text("Accepter et poursuivre")' },
  { kind: 'accept', selector: 'button:has-text("Tout accepter")' },
  { kind: 'accept', selector: 'button:has-text("Accept all")' },
  { kind: 'accept', selector: '#accept-cookies' },
];

function minDelayMs() {
  return Number(process.env.BRIDGE_POLITE_MIN_DELAY_MS ?? DEFAULT_MIN_DELAY_MS);
}

export function hostOf(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export async function waitForDomainBudget(rawUrl: string) {
  if (process.env.BRIDGE_POLITE_MODE === '0') return { waitedMs: 0, host: hostOf(rawUrl) };
  const host = hostOf(rawUrl);
  if (!host) return { waitedMs: 0, host };
  // Adaptive throttle: only enforce the minimum delay on hosts that have been
  // flagged aggressive (either pre-seeded via env or marked at runtime by
  // `assertNoAntiBot`). Permissive hosts pay no idle cost on first contact.
  if (!isHostAggressive(host)) {
    lastByHost.set(host, Date.now());
    return { waitedMs: 0, host, mode: 'permissive' as const };
  }
  const now = Date.now();
  const last = lastByHost.get(host) ?? 0;
  const waitMs = Math.max(0, minDelayMs() - (now - last));
  if (waitMs > 0) await sleep(waitMs);
  lastByHost.set(host, Date.now());
  return { waitedMs: waitMs, host, mode: 'throttled' as const };
}

export function looksLikeDirectAppSearch(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (!url.search) return false;
    return DIRECT_APP_SEARCH_PATTERNS.some((pattern) => pattern.test(url.pathname));
  } catch {
    return false;
  }
}

async function pageText(page: Page, limit = 5000) {
  return page.evaluate((max) => document.body?.innerText?.slice(0, max) ?? '', limit).catch(() => '');
}

export async function assertNoAntiBot(page: Page) {
  const text = await pageText(page);
  const matched = ANTI_BOT_PATTERNS.find((pattern) => pattern.test(text));
  if (matched) {
    // Mark the host as aggressive so subsequent navigations are throttled.
    // This is the trigger that switches a host from "permissive" to "12 s delay".
    const host = hostOf(page.url());
    if (host) markHostAggressive(host);
    throw new Error(`anti-bot verification detected (${matched.source}); stopping automation for manual handoff`);
  }
}

export async function assertUsefulPage(page: Page, action = 'page action') {
  const text = (await pageText(page, 800)).trim();
  const interactiveCount = await page
    .locator('a,button,input,select,textarea,[role="button"],[role="link"],[onclick],[tabindex]:not([tabindex="-1"])')
    .count()
    .catch(() => 0);
  if (!text && interactiveCount === 0) {
    throw new Error(`${action}: page appears blank or not hydrated; stop and retry through the visible UI instead of probing repeatedly`);
  }
}

export async function handleCookieConsent(page: Page) {
  if (process.env.BRIDGE_AUTO_COOKIES === '0') return { handled: false };
  for (const action of COOKIE_ACTIONS) {
    const btn = page.locator(action.selector).first();
    if (await btn.isVisible({ timeout: 700 }).catch(() => false)) {
      const box = await btn.boundingBox().catch(() => null);
      if (box) await humanMove(page, box.x + box.width / 2, box.y + box.height / 2);
      await humanPause(250, 700);
      await btn.click({ delay: randInt(60, 160) }).catch(() => {});
      await humanPause(900, 1800);
      return { handled: true, kind: action.kind };
    }
  }
  return { handled: false };
}

/**
 * Human-style warm-up after a navigation: a few mouse drifts and pauses to look
 * less like a robot. Adaptive: skipped for hosts visited in the last 60 s
 * (cookie banners and bot checks usually only fire on the first visit).
 *
 * Use `BRIDGE_HUMAN_WARMUP=0` to disable globally, `BRIDGE_PAGE_WARMUP_MS=0` to
 * disable per-call.
 */
export async function warmUpPage(
  page: Page,
  hostOrOpts?: string | { host?: string; durationMs?: number },
  legacyDurationMs?: number,
) {
  const opts =
    typeof hostOrOpts === 'string'
      ? { host: hostOrOpts, durationMs: legacyDurationMs }
      : (hostOrOpts ?? {});
  // Default 800 ms (was 2500). Combined with the 60 s adaptive skip on
  // already-visited hosts, this keeps the "tac tac tac" rhythm without losing
  // the cookie-banner / first-paint settle window.
  const durationMs = opts.durationMs ?? Number(process.env.BRIDGE_PAGE_WARMUP_MS ?? 800);
  if (process.env.BRIDGE_HUMAN_WARMUP === '0' || durationMs <= 0) return { warmedUp: false };
  // Skip warm-up if we've recently warmed up on this host — cookie banners /
  // bot checks usually only fire on the first hit. Saves ~2.5 s per page.
  if (opts.host) {
    const last = lastWarmupByHost.get(opts.host);
    if (last && Date.now() - last < WARMUP_REUSE_WINDOW_MS) {
      return { warmedUp: false, skipped: 'recent_visit' as const };
    }
  }
  const end = Date.now() + durationMs;
  const vp = page.viewportSize() ?? { width: 1280, height: 800 };
  while (Date.now() < end) {
    await humanMove(page, randInt(80, Math.max(100, vp.width - 80)), randInt(90, Math.max(120, vp.height - 120)));
    await humanPause(350, 900);
  }
  if (opts.host) lastWarmupByHost.set(opts.host, Date.now());
  return { warmedUp: true, durationMs };
}

export async function humanReadPage(page: Page, steps = 1) {
  const safeSteps = Math.max(0, Math.min(Number(steps) || 0, 5));
  for (let i = 0; i < safeSteps; i++) {
    await humanScroll(page, randInt(120, 360));
    await humanPause(700, 1600);
  }
}

export async function politeGoto(page: Page, url: string, options: { waitUntil?: any; allowDirectSearch?: boolean } = {}) {
  const budget = await waitForDomainBudget(url);
  const host = hostOf(url);
  const previous = lastNavigationByHost.get(host);
  const directSearch = looksLikeDirectAppSearch(url);
  if (directSearch && !options.allowDirectSearch && (!previous || Date.now() - previous.at > 5 * 60_000)) {
    throw new Error(`direct app search URL blocked by polite guard (${url}); start from the site home page and fill the visible form`);
  }
  await page.goto(url, { waitUntil: options.waitUntil ?? 'domcontentloaded' });
  lastNavigationByHost.set(host, { url: page.url(), at: Date.now() });
  const cookies = await handleCookieConsent(page);
  const warmup = await warmUpPage(page, { host });
  await assertNoAntiBot(page);
  await assertUsefulPage(page, 'navigate');
  return { ...budget, cookies, warmup, directSearch };
}
