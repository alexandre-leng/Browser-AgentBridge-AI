import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  console.log('Navigating to Bing...');
  await page.goto('https://www.bing.com');
  await page.waitForTimeout(2000);
  
  // Handle cookie consent on Bing
  const rejectCookies = page.locator('button:has-text("Reject")').or(page.locator('button:has-text("Refuser")')).first();
  if (await rejectCookies.isVisible().catch(() => false)) {
    console.log('Rejecting Bing cookies...');
    await rejectCookies.click();
    await page.waitForTimeout(1000);
  }
  
  await page.screenshot({ path: 'logs/screenshots/01-bing.png' });
  
  console.log('Searching for formalibre on Bing...');
  const searchBox = page.locator('textarea[name="q"], input[name="q"], #sb_form_q').first();
  await searchBox.fill('formalibre');
  await searchBox.press('Enter');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'logs/screenshots/02-bing-results.png' });
  
  console.log('Clicking formalibre.org link...');
  // Try different selectors for the result link
  const link = page.locator('a[href*="formalibre.org"]').first();
  await link.waitFor({ state: 'visible', timeout: 10000 });
  await link.click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'logs/screenshots/03-formalibre.png' });
  
  console.log('Looking for Connexion button...');
  // Try multiple possible texts
  const connexion = page.locator('text=Connexion, text=Login, text=Se connecter, a:has-text("Connexion"), a:has-text("Login")').first();
  await connexion.waitFor({ state: 'visible', timeout: 10000 });
  await connexion.click();
  await page.screenshot({ path: 'logs/screenshots/04-connexion.png' });
  
  console.log('Done! Check the screenshots.');
})();
