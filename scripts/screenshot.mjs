// Captures design-review screenshots of the built app into screenshots/.
// Usage: bun run build && bun scripts/screenshot.mjs
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { preview } from 'vite';

const server = await preview({ preview: { port: 4173, strictPort: true, open: false } });
const url = 'http://localhost:4173/';
await mkdir('screenshots', { recursive: true });

const browser = await chromium.launch();

// Desktop: the browse (home) view - three sample debates, including both finished verdicts
const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await desktop.goto(url);
await desktop.waitForLoadState('networkidle');
await desktop.screenshot({ path: 'screenshots/desktop-browse.png' });

// Desktop: a finished debate per verdict (confirmed thesis, objected thesis)
await desktop.locator('.debate-open', { hasText: 'transit data' }).click();
await desktop.waitForTimeout(300);
await desktop.screenshot({ path: 'screenshots/desktop-finished-confirmed.png' });
await desktop.goto(url);
await desktop.locator('.debate-open', { hasText: 'mandatory' }).click();
await desktop.waitForTimeout(300);
await desktop.screenshot({ path: 'screenshots/desktop-finished-objected.png' });

// Desktop: thesis view of the running sample debate
await desktop.goto(url);
await desktop.locator('.debate-open', { hasText: 'climate change' }).click();
await desktop.waitForTimeout(300);
await desktop.screenshot({ path: 'screenshots/desktop-thesis.png' });

// Desktop: drilled into the first pro argument
await desktop.locator('.card').first().click();
await desktop.waitForTimeout(300);
await desktop.screenshot({ path: 'screenshots/desktop-drilldown.png' });

// Desktop: drilled one level further, if the tree is deep enough
if ((await desktop.locator('.card').count()) > 0) {
  await desktop.locator('.card').first().click();
  await desktop.waitForTimeout(300);
  await desktop.screenshot({ path: 'screenshots/desktop-drilldown-deep.png' });
}

// Mobile: thesis view
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mobile.goto(url);
await mobile.waitForLoadState('networkidle');
await mobile.locator('.debate-open', { hasText: 'climate change' }).click();
await mobile.waitForTimeout(300);
await mobile.screenshot({ path: 'screenshots/mobile-thesis.png', fullPage: true });

await browser.close();
server.httpServer.close();
console.log(
  'Wrote screenshots/desktop-browse.png, desktop-finished-{confirmed,objected}.png, desktop-thesis.png, ' +
    'desktop-drilldown.png, desktop-drilldown-deep.png (if deep enough), mobile-thesis.png',
);
