import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { AsyncLocalStorage } from 'node:async_hooks';
import { STEALTH_SCRIPT } from './stealth.js';
import { log } from '../logger.js';

export interface LaunchOpts {
  headless?: boolean;
  channel?: 'chrome' | 'msedge' | 'chromium';
  cdpUrl?: string;
  profileDir?: string;
  maximized?: boolean;
}

export const sessionStore = new AsyncLocalStorage<string | undefined>();

export class BrowserController {
  private browser: Browser | null = null;
  private defaultContext: BrowserContext | null = null;
  private defaultPage: Page | null = null;
  
  private contexts = new Map<string, BrowserContext>();
  private pages = new Map<string, Page>();
  private eventListeners = new Set<(event: any) => void>();

  onEvent(cb: (event: any) => void) {
    this.eventListeners.add(cb);
    return () => this.eventListeners.delete(cb);
  }

  private emit(type: string, payload: any) {
    for (const cb of this.eventListeners) cb({ type, payload });
  }

  async launch(opts: LaunchOpts = {}, sessionId?: string) {
    const isDefault = !sessionId;
    if (isDefault && this.defaultContext) return;
    if (sessionId && this.contexts.has(sessionId)) return;

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

    let ctx: BrowserContext;
    if (!this.browser && !cdpUrl && !profileDir) {
      this.browser = await chromium.launch({
        headless: opts.headless ?? false,
        channel,
        args,
      });
    }

    if (cdpUrl) {
      this.browser = this.browser || await chromium.connectOverCDP(cdpUrl);
      ctx = this.browser.contexts()[0] ?? (await this.browser.newContext(contextOpts));
    } else if (profileDir) {
      ctx = await chromium.launchPersistentContext(profileDir, {
        headless: opts.headless ?? false,
        channel,
        args,
        ...contextOpts,
      });
    } else {
      ctx = await this.browser!.newContext(contextOpts);
    }

    await ctx.addInitScript(STEALTH_SCRIPT);
    
    ctx.on('page', (p) => {
      p.on('dialog', async (dialog) => {
        log('info', 'dialog handled', { type: dialog.type(), message: dialog.message() });
        await dialog.accept().catch(() => {});
      });
      p.on('download', async (download) => {
        const path = await download.path().catch(() => null);
        this.emit('browser.download', { 
          sessionId: sessionId || 'default', 
          filename: download.suggestedFilename(), 
          path, 
          url: download.url() 
        });
      });
    });

    const existing = ctx.pages()[0];
    const page = existing ?? (await ctx.newPage());
    
    if (existing) {
      page.on('dialog', async (dialog) => {
        log('info', 'dialog handled', { type: dialog.type(), message: dialog.message() });
        await dialog.accept().catch(() => {});
      });
      page.on('download', async (download) => {
        const path = await download.path().catch(() => null);
        this.emit('browser.download', { 
          sessionId: sessionId || 'default', 
          filename: download.suggestedFilename(), 
          path, 
          url: download.url() 
        });
      });
    }
    
    try { await page.bringToFront(); } catch {}

    if (isDefault) {
      this.defaultContext = ctx;
      this.defaultPage = page;
    } else {
      this.contexts.set(sessionId, ctx);
      this.pages.set(sessionId, page);
    }
  }

  async page(sessionId?: string): Promise<Page> {
    if (!sessionId) {
      if (!this.defaultPage) await this.launch();
      let p = this.defaultPage;
      if (!p) throw new Error('page not available');
      if (p.isClosed()) {
        const pages = this.defaultContext?.pages().filter((x) => !x.isClosed()) ?? [];
        this.defaultPage = pages[0] ?? (await this.defaultContext!.newPage());
        p = this.defaultPage;
      }
      try { await p.bringToFront(); } catch {}
      return p;
    } else {
      if (!this.contexts.has(sessionId)) await this.launch({}, sessionId);
      let p = this.pages.get(sessionId);
      if (!p || p.isClosed()) {
        const ctx = this.contexts.get(sessionId);
        const pages = ctx?.pages().filter((x) => !x.isClosed()) ?? [];
        p = pages[0] ?? (await ctx!.newPage());
        this.pages.set(sessionId, p);
      }
      try { await p.bringToFront(); } catch {}
      return p;
    }
  }

  ctx(sessionId?: string): BrowserContext {
    if (!sessionId) {
      if (!this.defaultContext) throw new Error('context not launched');
      return this.defaultContext;
    } else {
      const c = this.contexts.get(sessionId);
      if (!c) throw new Error(`context not launched for session ${sessionId}`);
      return c;
    }
  }

  setActivePage(p: Page, sessionId?: string) {
    if (!sessionId) this.defaultPage = p;
    else this.pages.set(sessionId, p);
  }

  async close(sessionId?: string) {
    if (!sessionId) {
      await this.defaultContext?.close().catch(() => {});
      await this.browser?.close().catch(() => {});
      this.browser = null;
      this.defaultContext = null;
      this.defaultPage = null;
      for (const ctx of this.contexts.values()) await ctx.close().catch(() => {});
      this.contexts.clear();
      this.pages.clear();
    } else {
      await this.contexts.get(sessionId)?.close().catch(() => {});
      this.contexts.delete(sessionId);
      this.pages.delete(sessionId);
    }
  }
  
  listSessions() {
    return Array.from(this.contexts.keys());
  }
}

export const controller = new BrowserController();
