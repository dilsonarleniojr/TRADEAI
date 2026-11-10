const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '../ui-audit/2026-11-08-UI-002-after');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const viewports = [
    { name: 'desktop-1440', width: 1440, height: 900 },
    { name: 'tablet-768', width: 768, height: 1024 },
    { name: 'mobile-390', width: 390, height: 844 },
  ];

  for (const vp of viewports) {
    const page = await browser.newPage({
      viewport: { width: vp.width, height: vp.height },
    });

    await page.goto('http://localhost:3100', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    // Open Direct AI Trade Modal
    const btn = page.locator('button[title="Iniciar Operação Direta com IA"]').first();
    if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(1000); // wait modal animation
    }

    // Capture Dark Mode
    await page.screenshot({ path: path.join(outDir, `${vp.name}-modal-after.png`) });

    await page.close();
  }

  await browser.close();
  console.log('AFTER screenshots captured in', outDir);
})();

