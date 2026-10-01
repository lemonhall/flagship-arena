import { expect } from '@playwright/test';
import { chooseBuild } from '../../tools/battle-policy.mjs';

export async function buyAvailableTraining(page) {
  await page.locator('#shipyard').click();
  for (let level = 1; level <= 3; level++) for (const track of ['gunnery', 'hull', 'handling']) {
    const current = Number((await page.locator(`[data-training-level="${track}"]`).textContent()).split('/')[0]);
    const button = page.locator(`[data-training="${track}"]`);
    if (current < level && await button.isEnabled()) await button.click();
  }
  await page.locator('#shipyard-close').click();
}

export async function finishBattle(page, capture = false) {
  for (let wave = 0; wave < 8; wave++) {
    await page.evaluate(() => window.__arena.advance(360));
    const state = await page.evaluate(() => ({ mode: window.__arena.mode,
      player: { hp: window.__arena.sim.unit('p0').hp, maxHp: window.__arena.sim.unit('p0').maxHp },
      choices: [...window.__arena.sim.upgradeChoices], wave: window.__arena.sim.upgradesChosen,
      waves: [3, 3, 4, 4, 5, 5][window.__arena.sim.stage] }));
    if (state.mode !== 'upgrade') break;
    await expect(page.locator('[data-upgrade]')).toHaveCount(3);
    if (capture && wave === 0) {
      const time = await page.evaluate(() => window.__arena.sim.time);
      await page.waitForTimeout(160);
      expect(await page.evaluate(() => window.__arena.sim.time)).toBe(time);
      await page.screenshot({ path: 'evidence/upgrade-desktop.png' });
    }
    const choice = chooseBuild({ unit: () => state.player, upgradeChoices: state.choices });
    await page.locator(`[data-upgrade="${choice}"]`).click();
    if (capture && state.wave === state.waves - 1) {
      await page.evaluate(() => {
        for (let i = 0; i < 100 && window.__arena.mode === 'battle' && !window.__arena.sim.hazards.length; i++) window.__arena.advance(.1);
      });
      if (await page.evaluate(() => window.__arena.mode === 'battle' && window.__arena.sim.hazards.length > 0)) {
        await page.screenshot({ path: 'evidence/boss-desktop.png' });
        await page.locator('#pause').click();
        await page.locator('#resume').click();
      }
    }
  }
  await expect(page.locator('#result')).toBeVisible({ timeout: 5000 });
  return page.evaluate(() => ({ outcome: window.__arena.sim.outcome, stage: window.__arena.sim.stage,
    choices: window.__arena.sim.upgradesChosen, loot: window.__arena.sim.loot, seconds: window.__arena.sim.time }));
}
