import { test, expect } from '@playwright/test';

test('rapid fire taps and simultaneous steering consume native zoom gestures', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 667 }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/?test=1&seed=101');
    await expect(page.locator('#loading')).toBeHidden();
    await page.locator('#start').tap();
    await expect(page.locator('#loading')).toBeHidden();
    await page.evaluate(() => {
      window.touchResults = [];
      for (const type of ['touchstart', 'touchmove', 'touchend']) window.addEventListener(type, e => {
        if (e.target.closest?.('#stick, #fire, #boost, #target')) window.touchResults.push({
          type, trusted: e.isTrusted, cancelable: e.cancelable, prevented: e.defaultPrevented,
          scale: visualViewport.scale,
        });
      }, { passive: true });
    });
    const stick = await page.locator('#stick').boundingBox(), fire = await page.locator('#fire').boundingBox();
    const helm = { x: stick.x + stick.width * .72, y: stick.y + stick.height * .32, id: 1 };
    const cdp = await context.newCDPSession(page);
    const send = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
    await send('touchStart', [helm]);
    // Alternate the label, reload text and rim, as fingers do while repeatedly firing.
    for (let i = 0; i < 12; i++) {
      const shot = { x: fire.x + fire.width * .5, y: fire.y + fire.height * [.4, .65, .86][i % 3], id: 2 };
      await send('touchStart', [helm, shot]);
      await expect(page.locator('#fire')).toHaveClass(/active/);
      expect(await page.evaluate(() => window.__arena.controls.stick?.x)).toBeGreaterThan(.3);
      await send('touchMove', [helm, { ...shot, x: shot.x + 2 }]);
      await send('touchEnd', [{ ...shot, x: shot.x + 2 }]);
      await expect(page.locator('#fire')).not.toHaveClass(/active/);
    }
    await send('touchEnd', []);
    for (let i = 0; i < 6; i++) await page.locator('#fire').tap();
    await page.locator('#boost').tap();
    const target = await page.evaluate(() => window.__arena.sim.unit('p0').target);
    await page.locator('#target').tap();
    await expect.poll(() => page.evaluate(() => window.__arena.sim.unit('p0').target)).not.toBe(target);
    const events = await page.evaluate(() => window.touchResults);
    expect(events.filter(e => e.type === 'touchend').length).toBeGreaterThanOrEqual(15);
    expect(events.every(e => e.trusted)).toBe(true);
    expect(events.every(e => e.scale === 1)).toBe(true);
    // Chrome already obeys touch-action; this additional contract closes WebKit's
    // default gesture path. It does not claim to emulate Safari's zoom recognizer.
    expect(events.filter(e => e.cancelable && !e.prevented), 'native control touches must not reach browser zoom').toEqual([]);
    expect(await page.evaluate(() => window.__arena.controls.fireId)).toBeNull();
    expect(await page.evaluate(() => window.__arena.controls.stick)).toBeNull();
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test('WebKit gesture fallback is confined to gameplay, including a just-released control', async ({ page }) => {
  await page.goto('/?test=1&seed=101');
  await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#start').click(); await expect(page.locator('#loading')).toBeHidden();
  const gesture = (selector, type) => page.locator(selector).evaluate((el, type) => {
    const e = new Event(type, { bubbles: true, cancelable: true }); el.dispatchEvent(e); return e.defaultPrevented;
  }, type);
  for (const type of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick']) {
    expect(await gesture('#fire span', type)).toBe(true);
    expect(await gesture('#battle', type)).toBe(true);
  }
  for (const input of ['mouse', 'Enter', 'Space']) {
    const next = await page.evaluate(() => {
      const s = window.__arena.sim, enemies = s.living(1);
      return enemies[(enemies.findIndex(e => e.id === s.unit('p0').target) + 1) % enemies.length].id;
    });
    if (input === 'mouse') await page.locator('#target').click();
    else { await page.locator('#target').focus(); await page.keyboard.press(input); }
    await expect.poll(() => page.evaluate(() => window.__arena.sim.unit('p0').target)).toBe(next);
    await page.waitForTimeout(80);
    expect(await page.evaluate(() => window.__arena.sim.unit('p0').target)).toBe(next);
  }
  await page.locator('#pause').click();
  expect(await gesture('#fire small', 'touchend')).toBe(true);
  expect(await gesture('#pause-menu', 'touchend')).toBe(false);
  expect(await gesture('#bgm-volume', 'touchmove')).toBe(false);
  await page.locator('#leave').click();
  expect(await gesture('#menu', 'touchmove')).toBe(false);
  expect(await gesture('#start', 'touchend')).toBe(false);
});
