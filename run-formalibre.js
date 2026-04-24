import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  console.log('Navigating to Google...');
  await page.goto('https://www.google.com');
  
  // Handle cookie consent
  const consentBtn = page.locator('button:has-text("Tout refuser")').or(page.locator('button:has-text("Reject all")')).first();
  if (await consentBtn.isVisible().catch(() => false)) {
    console.log('Rejecting cookies...');
    await consentBtn.click();
    await page.waitForTimeout(1000);
  }
  
  await page.screenshot({ path: 'logs/screenshots/01-google.png' });
  
  console.log('Searching for formalibre...');
  const searchBox = page.locator('textarea[name="q"]').first();
  await searchBox.fill('formalibre');
  await searchBox.press('Enter');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'logs/screenshots/02-search-results.png' });
  
  console.log('Clicking formalibre.org link...');
  const link = page.locator('a[href*="formalibre.org"]').first();
  await link.waitFor({ state: 'visible' });
  await link.click();
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'logs/screenshots/03-formalibre.png' });
  
  console.log('Clicking Connexion...');
  const connexion = page.locator('text=Connexion').first();
  await connexion.waitFor({ state: 'visible' });
  await connexion.click();
  await page.screenshot({ path: 'logs/screenshots/04-connexion.png' });
  
  console.log('Done!');
})();
