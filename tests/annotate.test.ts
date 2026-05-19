import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { annotateInteractive } from '../src/browser/agent.js';

describe('annotateInteractive', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser.close();
  });

  it('annotates a blank page without a browser-side __name global', async () => {
    await page.goto('about:blank');
    await page.evaluate(() => {
      delete (globalThis as any).__name;
    });

    const result = await annotateInteractive(page, 'test-blank');

    expect(result.elements).toEqual([]);
    expect(result.imageB64.length).toBeGreaterThan(100);
  });

  it('annotates simple interactive content', async () => {
    await page.setContent(`
      <main>
        <a href="/alpha">Alpha link</a>
        <button>Beta button</button>
        <input aria-label="Gamma input" />
      </main>
    `);

    const result = await annotateInteractive(page, 'test-simple');

    expect(result.elements.map((el) => el.name)).toEqual(expect.arrayContaining([
      'Alpha link',
      'Beta button',
      'Gamma input',
    ]));
  });
});
