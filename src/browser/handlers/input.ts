import type { HandlerContext, Handler } from './types.js';

export function inputHandlers(ctx: HandlerContext): Record<string, Handler> {
  return {
    'input.mouseMove': async ({ x, y }) => {
      await (await ctx.p()).mouse.move(x, y);
      return { ok: true };
    },
    'input.mouseDown': async ({ x, y, button = 'left' }) => {
      const page = await ctx.p();
      if (typeof x === 'number' && typeof y === 'number') await page.mouse.move(x, y);
      await page.mouse.down({ button });
      return { ok: true };
    },
    'input.mouseUp': async ({ x, y, button = 'left' }) => {
      const page = await ctx.p();
      if (typeof x === 'number' && typeof y === 'number') await page.mouse.move(x, y);
      await page.mouse.up({ button });
      return { ok: true };
    },
    'input.wheel': async ({ x, y, deltaX = 0, deltaY = 0 }) => {
      const page = await ctx.p();
      if (typeof x === 'number' && typeof y === 'number') await page.mouse.move(x, y);
      await page.mouse.wheel(deltaX, deltaY);
      return { ok: true };
    },
    'input.keyDown': async ({ key }) => {
      await (await ctx.p()).keyboard.down(key);
      return { ok: true };
    },
    'input.keyUp': async ({ key }) => {
      await (await ctx.p()).keyboard.up(key);
      return { ok: true };
    },
    'input.text': async ({ text }) => {
      await (await ctx.p()).keyboard.insertText(String(text ?? ''));
      return { ok: true };
    },
    'input.focus': async () => {
      const page = await ctx.p();
      await page.bringToFront();
      return { ok: true };
    },
    'viewport.set': async ({ width, height }) => {
      const page = await ctx.p();
      const w = Math.max(320, Math.min(4096, Math.round(width)));
      const h = Math.max(240, Math.min(4096, Math.round(height)));
      await page.setViewportSize({ width: w, height: h }).catch(() => {});
      return { width: w, height: h };
    },
  };
}
