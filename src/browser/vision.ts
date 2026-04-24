import type { Page } from 'playwright';
import crypto from 'node:crypto';
import { collectElements } from './agent.js';
import { sessionStore } from './controller.js';

export class VisionStream {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastHash: string | null = null;

  start(
    page: Page,
    fps: number,
    onFrame: (
      b64: string,
      meta: { w: number; h: number; cssW: number; cssH: number; dpr: number; url: string; elements?: any[] },
    ) => void,
    options: { annotate?: boolean } = {}
  ) {
    this.stop();
    const interval = Math.max(100, Math.round(1000 / Math.max(0.5, fps)));
    this.running = true;
    this.lastHash = null;
    const tick = async () => {
      if (!this.running) return;
      try {
        if (!page.isClosed()) {
          const buf = await page.screenshot({ type: 'jpeg', quality: 60, fullPage: false });
          const hash = crypto.createHash('md5').update(buf).digest('hex');
          if (hash === this.lastHash) {
            if (this.running) this.timer = setTimeout(tick, interval);
            return;
          }
          this.lastHash = hash;
          
          const vp = page.viewportSize();
          const dims = await page
            .evaluate(() => ({
              cssW: window.innerWidth,
              cssH: window.innerHeight,
              dpr: window.devicePixelRatio || 1,
            }))
            .catch(() => ({ cssW: vp?.width ?? 1280, cssH: vp?.height ?? 800, dpr: 1 }));

          let elements: any[] | undefined;
          if (options.annotate) {
            elements = await collectElements(page);
          }

          onFrame(buf.toString('base64'), {
            w: vp?.width ?? dims.cssW,
            h: vp?.height ?? dims.cssH,
            cssW: dims.cssW,
            cssH: dims.cssH,
            dpr: dims.dpr,
            url: page.url(),
            elements,
          });
        }
      } catch {
        // swallow — next tick may succeed
      }
      if (this.running) this.timer = setTimeout(tick, interval);
    };
    tick();
  }

  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  get active() {
    return this.running;
  }
}

export const vision = new VisionStream();
