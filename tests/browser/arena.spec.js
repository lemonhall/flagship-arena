import { test, expect } from '@playwright/test';
import { buyAvailableTraining, finishBattle } from './battle-helpers.js';

async function boot(page) {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?test=1&seed=101');
  await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
  return errors;
}
async function start(page) {
  await page.locator('#start').click();
  await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
  await expect(page.locator('#hud')).toBeVisible();
}
test('desktop: real models, steering, pause, six bosses, rewards and persisted progress', async ({ page }) => {
  test.setTimeout(180000);
  const errors = await boot(page);
  await page.screenshot({ path: 'evidence/menu-desktop.png' });
  await expect(page.locator('[data-stage="1"]')).toBeDisabled();
  await start(page);
  const heading = await page.evaluate(() => window.__arena.sim.unit('p0').heading);
  await page.keyboard.down('KeyD'); await page.waitForTimeout(350); await page.keyboard.up('KeyD');
  expect(await page.evaluate(() => window.__arena.sim.unit('p0').heading)).not.toBe(heading);
  await page.locator('#pause').click();
  const t = await page.evaluate(() => window.__arena.sim.time); await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__arena.sim.time)).toBe(t);
  await page.locator('#resume').click();
  await page.evaluate(() => { window.__arena.pilot(true); });
  await page.evaluate(() => window.__arena.advance(8));
  await page.screenshot({ path: 'evidence/battle-desktop.png' });
  const stats = await page.evaluate(() => window.__arena.stats());
  expect(stats.models).toEqual(expect.arrayContaining(['caravel', 'brig', 'repair', 'ammo']));
  expect(stats.triangles).toBeGreaterThan(10000);
  const runs = [];
  for (let stage = 0; stage < 6; stage++) {
    let won = false;
    for (let attempt = 0; attempt < 12 && !won; attempt++) {
      const result = await finishBattle(page, stage === 0 && attempt === 0); runs.push(result);
      won = result.outcome === 'victory';
      if (won) {
        expect(result.choices).toBe([3, 3, 4, 4, 5, 5][stage]);
        await expect(page.locator('#reward')).toContainText('已解锁');
      }
      if (stage === 5 && won) break;
      await page.locator('#back').click();
      await buyAvailableTraining(page);
      await page.locator(`[data-stage="${won ? stage + 1 : stage}"]`).click();
      const unlocked = ['caravel', 'brig', 'galleon', 'xebec', 'frigate', 'ship_of_line', 'zhenghe_baochuan'];
      const cleared = await page.evaluate(() => window.__arena.progress.cleared);
      await page.locator('#hull').selectOption(unlocked[cleared]);
      await start(page); await page.evaluate(() => window.__arena.pilot(true));
    }
    expect(won, JSON.stringify(runs)).toBe(true);
  }
  console.log('BROWSER_CAMPAIGN', JSON.stringify(runs));
  await page.screenshot({ path: 'evidence/victory.png' });
  await page.locator('#back').click();
  await expect(page.locator('#progress-label')).toHaveText('已征服 6 / 6');
  await page.reload(); await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
  await expect(page.locator('#progress-label')).toHaveText('已征服 6 / 6');
  await expect(page.locator('#hull option[value="zhenghe_baochuan"]')).toBeEnabled();
  await page.locator('#new-voyage').click();
  await expect(page.locator('#hull')).toHaveValue('zhenghe_baochuan');
  await expect(page.locator('#voyage')).toHaveValue('2');
  await expect(page.locator('[data-stage="1"]')).toBeDisabled();
  await start(page);
  expect(await page.evaluate(() => ({ hull: window.__arena.sim.unit('p0').hull, voyage: window.__arena.sim.voyage }))).toEqual({ hull: 'zhenghe_baochuan', voyage: 2 });
  await page.evaluate(() => window.__arena.advance(14));
  await page.screenshot({ path: 'evidence/treasure-ship.png' });
  expect((await finishBattle(page)).outcome).toBe('victory');
  await page.locator('#back').click();
  await page.reload(); await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
  await expect(page.locator('#voyage')).toHaveValue('2');
  await expect(page.locator('#progress-label')).toHaveText('已征服 1 / 6');
  await page.locator('#voyage').selectOption('1');
  await expect(page.locator('[data-stage="5"]')).toBeEnabled();
  await start(page);
  expect(await page.evaluate(() => window.__arena.sim.unit('p0').hull)).toBe('zhenghe_baochuan');
  await finishBattle(page);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('flagship-progress-v2')))).toMatchObject({ version: 2, cleared: 6, voyage: 2, voyageCleared: 1 });
  expect(errors).toEqual([]);
});

test('mobile portrait: simultaneous touch, release, blur and responsive controls', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await context.newPage(); const errors = await boot(page);
  await page.screenshot({ path: 'evidence/menu-mobile.png' }); await start(page);
  const stick = await page.locator('#stick').boundingBox(), fire = await page.locator('#fire').boundingBox();
  expect(stick.x + stick.width).toBeLessThan(fire.x);
  const session = await context.newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
    { x: stick.x + stick.width * .75, y: stick.y + stick.height * .3, id: 1 },
    { x: fire.x + fire.width * .5, y: fire.y + fire.height * .5, id: 2 },
  ] });
  await page.waitForTimeout(500);
  const input = await page.evaluate(() => ({ steering: window.__arena.controls.stick?.x, firing: window.__arena.controls.fireId !== null }));
  expect(input.steering).toBeGreaterThan(.3); expect(input.firing).toBe(true);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(await page.evaluate(() => window.__arena.controls.fireId)).toBeNull();
  await page.evaluate(() => { window.__arena.pilot(true); window.__arena.advance(14); });
  if (await page.locator('#upgrade-menu').isVisible()) await page.locator('[data-upgrade]').first().click();
  await page.waitForTimeout(400); await page.screenshot({ path: 'evidence/battle-mobile.png' });
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('#pause-menu')).toBeVisible();
  expect(await page.evaluate(() => window.__arena.controls.keys.size)).toBe(0);
  await page.locator('#resume').click();
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(300); await page.screenshot({ path: 'evidence/battle-landscape.png' });
  for (const id of ['#stick', '#fire', '#boost', '#pause']) {
    const b = await page.locator(id).boundingBox(); expect(b.x).toBeGreaterThanOrEqual(0); expect(b.y).toBeGreaterThanOrEqual(0); expect(b.y + b.height).toBeLessThanOrEqual(390);
  }
  expect(errors).toEqual([]); await context.close();
});
