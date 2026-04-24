import type { Page } from 'playwright';

export class VisionStream {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  start(
    page: Page,
    fps: number,
    onFrame: (
      b64: string,
      meta: { w: number; h: number; cssW: number; cssH: number; dpr: number; url: string },
    ) => void,
  ) {
    this.stop();
    const interval = Math.max(100, Math.round(1000 / Math.max(0.5, fps)));
    this.running = true;
    const tick = async () => {
      if (!this.running) return;
      try {
        if (!page.isClosed()) {
          const buf = await page.screenshot({ type: 'jpeg', quality: 60, fullPage: false });
          const vp = page.viewportSize();
          const dims = await page
            .evaluate(() => ({
              cssW: window.innerWidth,
              cssH: window.innerHeight,
              dpr: window.devicePixelRatio || 1,
            }))
            .catch(() => ({ cssW: vp?.width ?? 1280, cssH: vp?.height ?? 800, dpr: 1 }));
          onFrame(buf.toString('base64'), {
            w: vp?.width ?? dims.cssW,
            h: vp?.height ?? dims.cssH,
            cssW: dims.cssW,
            cssH: dims.cssH,
            dpr: dims.dpr,
            url: page.url(),
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
