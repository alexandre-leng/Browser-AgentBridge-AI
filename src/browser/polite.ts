import type { Page } from 'playwright';
import { humanMove, humanPause, humanScroll, randInt, sleep } from './human.js';

const DEFAULT_MIN_DELAY_MS = 12000;
const lastByHost = new Map<string, number>();
const lastNavigationByHost = new Map<string, { url: string; at: number }>();

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
  const now = Date.now();
  const last = lastByHost.get(host) ?? 0;
  const waitMs = Math.max(0, minDelayMs() - (now - last));
  if (waitMs > 0) await sleep(waitMs);
  lastByHost.set(host, Date.now());
  return { waitedMs: waitMs, host };
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

export async function warmUpPage(page: Page, durationMs = Number(process.env.BRIDGE_PAGE_WARMUP_MS ?? 2500)) {
  if (process.env.BRIDGE_HUMAN_WARMUP === '0' || durationMs <= 0) return { warmedUp: false };
  const end = Date.now() + durationMs;
  const vp = page.viewportSize() ?? { width: 1280, height: 800 };
  while (Date.now() < end) {
    await humanMove(page, randInt(80, Math.max(100, vp.width - 80)), randInt(90, Math.max(120, vp.height - 120)));
    await humanPause(350, 900);
  }
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
  const warmup = await warmUpPage(page);
  await assertNoAntiBot(page);
  await assertUsefulPage(page, 'navigate');
  return { ...budget, cookies, warmup, directSearch };
}
