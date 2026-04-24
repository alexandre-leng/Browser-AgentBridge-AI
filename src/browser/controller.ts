import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { STEALTH_SCRIPT } from './stealth.js';

export interface LaunchOpts {
  headless?: boolean;
  channel?: 'chrome' | 'msedge' | 'chromium';
  cdpUrl?: string;
  profileDir?: string;
  maximized?: boolean;
}

export class BrowserController {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private currentPage: Page | null = null;

  async launch(opts: LaunchOpts = {}) {
    if (this.context) return;

    const cdpUrl = opts.cdpUrl ?? process.env.CHROME_CDP_URL;
    const profileDir = opts.profileDir ?? process.env.CHROME_PROFILE;
    const channel = opts.channel ?? (process.env.CHROME_CHANNEL as LaunchOpts['channel']) ?? 'chrome';
    const maximized = opts.maximized ?? true;
    const args = [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      ...(maximized ? ['--start-maximized'] : []),
    ];

    const contextOpts = {
      viewport: null as null,
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      locale: 'fr-FR',
      timezoneId: 'Europe/Paris',
      acceptDownloads: true,
    };

    if (cdpUrl) {
      this.browser = await chromium.connectOverCDP(cdpUrl);
      this.context = this.browser.contexts()[0] ?? (await this.browser.newContext(contextOpts));
    } else if (profileDir) {
      this.context = await chromium.launchPersistentContext(profileDir, {
        headless: false,
        channel,
        args,
        ...contextOpts,
      });
    } else {
      this.browser = await chromium.launch({
        headless: opts.headless ?? false,
        channel,
        args,
      });
      this.context = await this.browser.newContext(contextOpts);
    }

    // Inject stealth patches before any page script
    await this.context.addInitScript(STEALTH_SCRIPT);

    const existing = this.context.pages()[0];
    this.currentPage = existing ?? (await this.context.newPage());
    try {
      await this.currentPage.bringToFront();
    } catch {
      /* ignore */
    }
  }

  async page(): Promise<Page> {
    if (!this.currentPage) await this.launch();
    const p = this.currentPage;
    if (!p) throw new Error('page not available');
    if (p.isClosed()) {
      const pages = this.context?.pages().filter((x) => !x.isClosed()) ?? [];
      this.currentPage = pages[0] ?? (await this.context!.newPage());
    }
    try {
      await this.currentPage!.bringToFront();
    } catch {
      /* ignore */
    }
    return this.currentPage!;
  }

  ctx(): BrowserContext {
    if (!this.context) throw new Error('context not launched');
    return this.context;
  }

  setActivePage(p: Page) {
    this.currentPage = p;
  }

  async close() {
    await this.context?.close().catch(() => {});
    await this.browser?.close().catch(() => {});
    this.browser = null;
    this.context = null;
    this.currentPage = null;
  }
}

export const controller = new BrowserController();
