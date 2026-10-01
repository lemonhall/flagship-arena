import { test, expect } from '@playwright/test';

async function bootBattle(page) {
  await page.goto('/?test=1&seed=101');
  await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#start').click(); await expect(page.locator('#loading')).toBeHidden();
}

test('a wave popup cannot turn rapid fire taps into retreat or an upgrade choice', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 667 }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage(); await bootBattle(page);
    const fire = await page.locator('#fire').boundingBox();
    const point = { x: fire.x + fire.width / 2, y: fire.y + fire.height / 2, id: 1 };
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await page.evaluate(() => window.__arena.advance(100));
    await expect(page.locator('#upgrade-menu')).toBeVisible();
    const time = await page.evaluate(() => window.__arena.sim.time);
    await page.waitForTimeout(600);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    for (let i = 0; i < 12; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    expect(await page.evaluate(() => window.__arena.mode)).toBe('upgrade');
    expect(await page.evaluate(() => window.__arena.sim.upgradesChosen)).toBe(0);
    expect(await page.evaluate(() => window.__arena.sim.time)).toBe(time);
    // Even after the release guard unlocks, the entire previous fire zone is inert.
    await expect(page.locator('[data-upgrade]').first()).toBeEnabled();
    for (const viewport of [{ width: 390, height: 667 }, { width: 320, height: 480 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      await page.locator('[data-upgrade]').last().scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => {
        const zone = document.querySelector('#fire').getBoundingClientRect();
        return [...document.querySelectorAll('#upgrade-menu button')].every(button => {
          const r = button.getBoundingClientRect();
          return r.right <= zone.left - 12 || r.left >= zone.right + 12 || r.bottom <= zone.top - 12 || r.top >= zone.bottom + 12;
        });
      })).toBe(true);
      await page.screenshot({ path: `evidence/upgrade-safe-${viewport.width}x${viewport.height}.png` });
    }
    await page.locator('[data-upgrade="battery"]').tap();
    await expect(page.locator('#upgrade-menu')).toBeHidden();
    expect(await page.evaluate(() => window.__arena.sim.upgradesChosen)).toBe(1);
    expect(await page.evaluate(() => window.__arena.sim.loot)).toBeGreaterThanOrEqual(9);
  } finally { await context.close(); }
});

test('held fire key and continued clicks must settle before wave options accept input', async ({ page }) => {
  await bootBattle(page);
  await page.keyboard.down('Space');
  await page.evaluate(() => window.__arena.advance(100));
  await expect(page.locator('#upgrade-menu')).toBeVisible();
  await page.waitForTimeout(650);
  await expect(page.locator('[data-upgrade]').first()).toBeDisabled();
  await page.keyboard.up('Space');
  const card = await page.locator('[data-upgrade]').first().boundingBox();
  for (let i = 0; i < 6; i++) {
    await page.mouse.click(card.x + card.width / 2, card.y + card.height / 2);
    await page.waitForTimeout(100);
  }
  expect(await page.evaluate(() => window.__arena.sim.upgradesChosen)).toBe(0);
  await expect(page.locator('[data-upgrade]').first()).toBeEnabled();
  await page.locator('#upgrade-leave').click();
  await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator('#menu-parts')).toHaveText('9');
});
