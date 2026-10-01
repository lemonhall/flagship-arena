import { test, expect } from '@playwright/test';
import { buyAvailableTraining } from './battle-helpers.js';

// REQ-0002-003/005/007: each person owns only their browser's progress.
test('sharing the same URL keeps two browsers progress and training independent', async ({ browser }) => {
  const a = await browser.newContext(), b = await browser.newContext();
  await a.addInitScript(() => localStorage.setItem('flagship-progress-v1', JSON.stringify({ cleared: 6, voyage: 2, voyageCleared: 1 })));
  const pageA = await a.newPage(), pageB = await b.newPage(), uploads = [];
  for (const page of [pageA, pageB]) page.on('request', r => { if (['POST', 'PUT', 'PATCH'].includes(r.method())) uploads.push(r.url()); });
  await pageA.goto('/?test=1'); await expect(pageA.locator('#loading')).toBeHidden();
  await pageB.goto('/?test=1'); await expect(pageB.locator('#loading')).toBeHidden();
  await pageA.locator('#shipyard').click();
  await expect(pageA.locator('#parts-balance')).toHaveText('48');
  await pageA.locator('[data-training="gunnery"]').click();
  await expect(pageA.locator('#parts-balance')).toHaveText('36');
  await pageA.reload(); await expect(pageA.locator('#loading')).toBeHidden();
  await pageA.locator('#shipyard').click();
  await expect(pageA.locator('[data-training-level="gunnery"]')).toHaveText('1 / 3');
  await pageB.locator('#shipyard').click();
  await expect(pageB.locator('#parts-balance')).toHaveText('0');
  await expect(pageB.locator('[data-training="gunnery"]')).toBeDisabled();
  await pageB.locator('#shipyard-close').click();
  await expect(pageB.locator('#progress-label')).toHaveText('已征服 0 / 6');
  await expect(pageB.locator('[data-stage="1"]')).toBeDisabled();
  expect(await pageB.evaluate(() => JSON.parse(localStorage.getItem('flagship-progress-v2'))?.training.gunnery ?? 0)).toBe(0);
  expect(uploads).toEqual([]);
  await a.close(); await b.close();
});

test('earned salvage survives a real defeat, retry and reload without duplicate settlement', async ({ page }) => {
  // LAN HTTP has getRandomValues but may not expose the secure-context UUID API.
  await page.addInitScript(() => Object.defineProperty(crypto, 'randomUUID', { value: undefined }));
  await page.goto('/?test=1&seed=101');
  await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#start').click(); await expect(page.locator('#loading')).toBeHidden();
  await page.evaluate(() => { window.__arena.pilot(true); window.__arena.advance(100); });
  await expect(page.locator('#upgrade-menu')).toBeVisible();
  await page.locator('[data-upgrade="battery"]').click();
  await page.evaluate(() => { window.__arena.pilot(false); window.__arena.advance(300, { throttle: 0 }); });
  // If the two allies clear a wave first, make a legitimate offered choice.
  for (let i = 0; i < 4 && await page.locator('#upgrade-menu').isVisible(); i++) {
    await page.locator('[data-upgrade]').first().click();
    await page.evaluate(() => window.__arena.advance(300, { throttle: 0 }));
  }
  await expect(page.locator('#result')).toBeVisible();
  expect(await page.evaluate(() => window.__arena.sim.outcome)).toBe('defeat');
  const loot = await page.evaluate(() => window.__arena.sim.loot);
  expect(loot).toBeGreaterThan(0);
  await expect(page.locator('#reward')).toContainText(`${loot} 零件`);
  await page.locator('#next').click(); await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#pause').click(); await page.locator('#leave').click();
  await expect(page.locator('#menu-parts')).toHaveText(String(loot));
  await page.reload(); await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#menu-parts')).toHaveText(String(loot));
  await expect(page.locator('#progress-label')).toHaveText('已征服 0 / 6');
});

test('mobile shipyard and wave choices remain reachable at short portrait and landscape sizes', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 667 }, isMobile: true, hasTouch: true });
  await context.addInitScript(() => {
    if (!localStorage.getItem('flagship-progress-v2')) localStorage.setItem('flagship-progress-v1', JSON.stringify({ cleared: 6 }));
  });
  const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?test=1&seed=101'); await expect(page.locator('#loading')).toBeHidden();
  await buyAvailableTraining(page);
  await page.locator('#shipyard').tap();
  await page.screenshot({ path: 'evidence/shipyard-mobile.png' });
  await page.locator('#shipyard-close').tap();
  await page.locator('[data-stage="0"]').tap(); await page.locator('#hull').selectOption('caravel');
  await page.locator('#start').tap(); await expect(page.locator('#loading')).toBeHidden();
  await page.evaluate(() => { window.__arena.pilot(true); window.__arena.advance(100); });
  await expect(page.locator('#upgrade-menu')).toBeVisible();
  const time = await page.evaluate(() => window.__arena.sim.time);
  const camera = await page.evaluate(() => window.__arena.stats().camera);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__arena.stats().camera)).toEqual(camera);
  for (const viewport of [{ width: 390, height: 667 }, { width: 320, height: 480 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    const cards = page.locator('[data-upgrade]');
    for (const card of await cards.all()) {
      await card.scrollIntoViewIfNeeded();
      expect(await card.evaluate(el => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return el.contains(hit);
      })).toBe(true);
    }
    await page.screenshot({ path: `evidence/upgrade-${viewport.width}x${viewport.height}.png` });
  }
  expect(await page.evaluate(() => window.__arena.sim.time)).toBe(time);
  const offered = await page.evaluate(() => [...window.__arena.sim.upgradeChoices]);
  await page.locator(`[data-upgrade="${offered[0]}"]`).tap();
  expect(await page.evaluate(() => window.__arena.sim.upgradesChosen)).toBe(1);
  await expect(page.locator('#upgrade-menu')).toBeHidden();
  await page.locator('#pause').tap();
  const pausedCamera = await page.evaluate(() => window.__arena.stats().camera);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__arena.stats().camera)).toEqual(pausedCamera);
  expect(errors).toEqual([]); await context.close();
});
