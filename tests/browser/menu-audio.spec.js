import { test, expect } from '@playwright/test';

async function boot(page) {
  await page.goto('/?test=1');
  await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
}

test('music: first visit is 60%, with loop and no unsolicited autoplay', async ({ page }) => {
  await boot(page);
  const settings = await page.evaluate(() => {
    const a = window.__arena.audio;
    return { volume: a.bgmVolume, enabled: a.bgmEnabled, loop: a.bgm.loop, paused: a.bgm.paused };
  });
  expect(settings).toEqual({ volume: .6, enabled: true, loop: true, paused: true });
});

test('short mobile viewport keeps Start reachable and overflow scrolls by touch', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 667 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(); await boot(page);
  let start = await page.locator('#start').boundingBox();
  expect(start.y + start.height).toBeLessThanOrEqual(651);
  await page.screenshot({ path: 'evidence/menu-short-mobile.png' });
  await page.setViewportSize({ width: 320, height: 480 });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 24, y: 390, id: 1 }] });
  for (let y = 370; y >= 90; y -= 20) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 24, y, id: 1 }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.locator('#menu').evaluate(e => e.scrollTop)).toBeGreaterThan(20);
  await expect.poll(async () => {
    const r = await page.locator('#start').boundingBox(); return r.y + r.height;
  }).toBeLessThanOrEqual(464);
  await page.locator('#start').tap();
  await expect(page.locator('#hud')).toBeVisible();
  await context.close();
});

test('music: real MP3 plays, loops, adjusts output gain and remembers off independently of effects', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await boot(page);
  await page.locator('#menu [data-bgm-toggle]').click();
  await page.reload(); await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#menu [data-bgm-toggle]')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#start').click(); await expect(page.locator('#hud')).toBeVisible();
  expect(await page.locator('#bgm-track').evaluate(e => e.paused)).toBe(true);
  await page.locator('#music').click(); await expect(page.locator('#pause-menu')).toBeVisible();
  await page.locator('#bgm-toggle').click();
  await expect.poll(() => page.locator('#bgm-track').evaluate(e => e.currentTime)).toBeGreaterThan(.2);
  const track = await page.locator('#bgm-track').evaluate(e => ({ duration: e.duration, loop: e.loop, error: e.error }));
  expect(track.duration).toBeGreaterThan(170); expect(track.loop).toBe(true); expect(track.error).toBeNull();
  await page.locator('#bgm-volume').fill('0.25');
  await expect(page.locator('#bgm-value')).toHaveText('25%');
  await expect.poll(() => page.evaluate(() => window.__arena.audio.bgmGain.gain.value)).toBeCloseTo(.25, 2);
  await page.locator('#bgm-volume').press('ArrowRight');
  await expect(page.locator('#bgm-value')).toHaveText('30%');
  expect(await page.evaluate(() => window.__arena.controls.keys.size)).toBe(0);
  await page.locator('#bgm-track').evaluate(e => { e.currentTime = e.duration - .2; });
  await expect.poll(() => page.locator('#bgm-track').evaluate(e => e.currentTime), { timeout: 5000 }).toBeLessThan(3);
  expect(await page.locator('#bgm-track').evaluate(e => e.paused)).toBe(false);
  await page.locator('#bgm-volume').fill('0');
  expect(await page.locator('#bgm-track').evaluate(e => e.paused)).toBe(true);
  await page.locator('#bgm-volume').fill('0.25');
  await page.locator('#bgm-toggle').click();
  await page.locator('#resume').click();
  await page.locator('#sound').click(); await page.locator('#sound').click();
  expect(await page.locator('#bgm-track').evaluate(e => e.paused)).toBe(true);
  await page.reload(); await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#menu-bgm-volume')).toHaveValue('0.25');
  await expect(page.locator('#menu [data-bgm-toggle]')).toHaveAttribute('aria-pressed', 'false');
  expect(errors).toEqual([]);
});
