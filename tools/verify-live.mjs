import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const url = process.argv[2] || 'https://flagship-arena-web.lemonhall.me';
const browser = await chromium.launch({ channel: 'chrome', headless: true,
  ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}) });
const report = { url, checkedAt: new Date().toISOString(), devices: [] };
await mkdir('evidence', { recursive: true });
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 667 } : { width: 1440, height: 900 }, isMobile: mobile, hasTouch: mobile });
    if (!mobile) await context.addInitScript(() => {
      if (!localStorage.getItem('flagship-progress-v2')) localStorage.setItem('flagship-progress-v1', JSON.stringify({ cleared: 6 }));
    });
    const page = await context.newPage(), errors = [], assets = new Map(), uploads = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => { if (['POST', 'PUT', 'PATCH'].includes(r.method())) uploads.push(r.url()); });
    page.on('response', r => { if (/\.(glb|mp3)$/.test(new URL(r.url()).pathname)) assets.set(new URL(r.url()).pathname, r.status()); });
    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    expect(response.status()).toBe(200);
    await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
    expect(await page.evaluate(() => typeof window.__arena)).toBe('undefined');
    await expect(page.locator('#upgrade-menu .upgrade-heading #upgrade-leave')).toHaveCount(1);
    await expect(page.locator('#upgrade-menu')).toHaveAttribute('tabindex', '-1');
    await expect(page.locator('#menu-parts')).toHaveText(mobile ? '0' : '48');
    await page.locator('#shipyard').click();
    if (!mobile) {
      await page.locator('[data-training="gunnery"]').click();
      await expect(page.locator('#parts-balance')).toHaveText('36');
      await expect(page.locator('[data-training-level="gunnery"]')).toHaveText('1 / 3');
    } else await expect(page.locator('[data-training="gunnery"]')).toBeDisabled();
    await page.locator('#shipyard-close').click();
    if (!mobile) { await page.locator('[data-stage="0"]').click(); await page.locator('#hull').selectOption('caravel'); }
    const start = await page.locator('#start').boundingBox();
    expect(start.y).toBeGreaterThanOrEqual(0);
    expect(start.y + start.height).toBeLessThanOrEqual(page.viewportSize().height - 16);
    await expect(page.locator('#menu-bgm-volume')).toHaveValue('0.6');
    await expect(page.locator('#menu [data-bgm-toggle]')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.locator('#bgm-track').evaluate(e => e.paused)).toBe(true);
    await page.locator('#start').click();
    await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
    await expect(page.locator('#hud')).toBeVisible();
    await expect.poll(() => page.locator('#bgm-track').evaluate(e => e.currentTime), { timeout: 15000 }).toBeGreaterThan(.2);
    const music = await page.locator('#bgm-track').evaluate(e => ({ duration: e.duration, loop: e.loop, error: e.error }));
    expect(music.duration).toBeGreaterThan(170);
    expect(music.loop).toBe(true);
    expect(music.error).toBeNull();
    // Random reefs and download latency change when a broadside enters firing range.
    // Keep steering and firing until a real round is spent, instead of guessing a delay.
    if (!mobile) {
      await page.keyboard.down('KeyD'); await page.keyboard.down('Space');
      try { await expect(page.locator('#ammo-text')).not.toHaveText('120 / 120', { timeout: 10000 }); }
      finally { await page.keyboard.up('KeyD'); await page.keyboard.up('Space'); }
    } else {
      await page.evaluate(() => {
        window.nativeFireTouches = [];
        for (const type of ['touchstart', 'touchend']) window.addEventListener(type, e => {
          if (e.target.closest?.('#fire')) window.nativeFireTouches.push({ type, prevented: e.defaultPrevented, scale: visualViewport.scale });
        }, { passive: true });
      });
      const stick = await page.locator('#stick').boundingBox(), fire = await page.locator('#fire').boundingBox();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
        { x: stick.x + stick.width * .88, y: stick.y + stick.height * .25, id: 1 },
        { x: fire.x + fire.width / 2, y: fire.y + fire.height / 2, id: 2 },
      ] });
      try {
        await expect(page.locator('#fire')).toHaveClass(/active/);
        await expect(page.locator('#ammo-text')).not.toHaveText('120 / 120', { timeout: 10000 });
      } finally { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
      for (let i = 0; i < 12; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fire.x + fire.width / 2, y: fire.y + fire.height / 2, id: 1 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      }
      const nativeTouches = await page.evaluate(() => window.nativeFireTouches);
      expect(nativeTouches.length).toBeGreaterThanOrEqual(24);
      expect(nativeTouches.every(e => e.prevented && e.scale === 1)).toBe(true);
      report.mobileRapidFire = { touchEvents: nativeTouches.length, scale: 1, defaultsPrevented: true };
    }
    const ammunition = await page.locator('#ammo-text').textContent();
    await page.screenshot({ path: `evidence/live-${mobile ? 'mobile' : 'desktop'}.png` });
    await page.locator('#music').click(); await expect(page.locator('#pause-menu')).toBeVisible();
    await page.locator('#bgm-volume').fill('0.25');
    await expect(page.locator('#bgm-value')).toHaveText('25%');
    await page.locator('#bgm-toggle').click();
    expect(await page.locator('#bgm-track').evaluate(e => e.paused)).toBe(true);
    await page.screenshot({ path: `evidence/live-${mobile ? 'mobile' : 'desktop'}-music.png` });
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
    await expect(page.locator('#menu-bgm-volume')).toHaveValue('0.25');
    await expect(page.locator('#menu [data-bgm-toggle]')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#menu-parts')).toHaveText(mobile ? '0' : '36');
    const localProgress = await page.evaluate(() => JSON.parse(localStorage.getItem('flagship-progress-v2')));
    expect(localProgress.training.gunnery).toBe(mobile ? 0 : 1);
    expect(uploads).toEqual([]);
    expect(await page.locator('#bgm-track').evaluate(e => e.paused)).toBe(true);
    expect(errors).toEqual([]);
    expect(assets.size).toBeGreaterThanOrEqual(5);
    expect(assets.has('/audio/flagship_arena_bgm.mp3')).toBe(true);
    expect([...assets.values()].every(code => code === 200 || code === 206)).toBe(true);
    report.devices.push({ device: mobile ? 'mobile Chrome emulation' : 'desktop Chrome', viewport: page.viewportSize(), startButton: start, status: response.status(), assets: Object.fromEntries(assets), errors, ammunition, localProgress, progressUploads: uploads, music: { ...music, savedVolume: .25, savedEnabled: false } });
    await context.close();
  }
} finally { await browser.close(); }
await writeFile('evidence/production.json', JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log('PRODUCTION_OK', JSON.stringify(report));
