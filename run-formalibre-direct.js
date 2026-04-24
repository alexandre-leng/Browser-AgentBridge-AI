import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  console.log('Going directly to formalibre.org...');
  await page.goto('https://www.formalibre.org');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'logs/screenshots/01-formalibre.png' });
  
  console.log('Clicking Connexion...');
  // Try various selectors for the login link
  const selectors = [
    'a:has-text("Connexion")',
    'a:has-text("Login")',
    'a:has-text("Se connecter")',
    '[href*="login"]',
    '[href*="connexion"]',
    'button:has-text("Connexion")'
  ];
  
  let clicked = false;
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if (await el.isVisible().catch(() => false)) {
      console.log(`Found: ${sel}`);
      await el.click();
      clicked = true;
      break;
    }
  }
  
  if (!clicked) {
    console.log('Connexion not found with standard selectors, dumping page text...');
    const text = await page.locator('body').textContent();
    console.log(text.substring(0, 1000));
  }
  
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'logs/screenshots/02-connexion.png' });
  
  console.log('Done!');
})();
