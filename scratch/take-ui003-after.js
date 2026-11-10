const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

async function capture() {
  const outDir = path.join(__dirname, '../ui-audit/2026-11-08-UI-003-after');
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const viewports = [
    { name: 'mobile', width: 390, height: 844 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1440, height: 900 },
  ];

  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    try {
      await page.goto('http://localhost:3100/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(outDir, `dashboard-${vp.name}-dark.png`), fullPage: false });
    } catch (e) {
      console.error(`Error capturing ${vp.name}:`, e.message);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  console.log('Screenshots captured successfully in', outDir);
}

capture().catch(err => {
  console.error('Capture failed:', err);
  process.exit(1);
});
