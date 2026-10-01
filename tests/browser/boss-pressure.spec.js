import { test, expect } from '@playwright/test';
import { chooseBuild } from '../../tools/battle-policy.mjs';

test('real final boss is a giant with readable bombardment on desktop and mobile', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true, isMobile: true });
  try {
    // An existing completed save equips its legitimately unlocked treasure ship.
    await context.addInitScript(() => localStorage.setItem('flagship-progress-v1', JSON.stringify({ cleared: 6 })));
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/?test=1&seed=101');
    await expect(page.locator('#loading')).toBeHidden();
    await page.locator('[data-stage="5"]').click();
    await page.locator('#hull').selectOption('zhenghe_baochuan');
    await page.locator('#start').click();
    await expect(page.locator('#loading')).toBeHidden();
    for (let wave = 0; wave < 5; wave++) {
      await page.evaluate(() => window.__arena.advance(360));
      await expect(page.locator('#upgrade-menu')).toBeVisible();
      const state = await page.evaluate(() => ({ player: window.__arena.sim.unit('p0'), choices: window.__arena.sim.upgradeChoices }));
      const choice = chooseBuild({ unit: () => state.player, upgradeChoices: state.choices });
      await page.locator(`[data-upgrade="${choice}"]`).click();
    }
    await page.evaluate(() => {
      for (let i = 0; i < 300 && window.__arena.mode === 'battle' && !window.__arena.sim.hazards.length; i++) window.__arena.advance(.05);
    });
    await expect(page.locator('#boss-hud')).toBeVisible();
    // Use normal target-cycle commands to frame the boss, then stop firing for screenshots.
    await page.evaluate(() => {
      for (let i = 0; i < 3 && !window.__arena.sim.unit(window.__arena.sim.unit('p0').target)?.boss; i++) {
        window.__arena.advance(1 / 60, { cycle: true, throttle: 0 });
        window.__arena.advance(1 / 60, { cycle: false, throttle: 0 });
      }
    });
    await page.waitForTimeout(150);
    const stats = await page.evaluate(() => window.__arena.stats());
    const boss = stats.ships.find(ship => ship.boss), normal = stats.ships.find(ship => !ship.boss);
    expect(boss.length / normal.length).toBeCloseTo(3.5, 2);
    expect(boss.length).toBeGreaterThan(69);
    expect(await page.evaluate(() => window.__arena.sim.hazards.every(h => h.shape === 'circle'))).toBe(true);
    expect(await page.evaluate(() => window.__arena.sim.hazards.length)).toBeGreaterThanOrEqual(6);
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 667 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      await page.screenshot({ path: `evidence/boss-pressure-${viewport.width}x${viewport.height}.png` });
      for (const id of ['#fire', '#boost', '#stick']) {
        expect(await page.locator(id).evaluate(el => {
          const r = el.getBoundingClientRect();
          return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        })).toBe(true);
      }
    }
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
