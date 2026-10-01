#!/usr/bin/env node
/**
 * Upload the cover image and the English screenshots to the itch project.
 *
 *   node tools/itch/upload-media.mjs [--game=5084705] [--dry-run]
 *
 * itch has separate uploaders for the cover and the screenshot gallery, both of which open the
 * native file chooser when their button is pressed.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const ENDPOINT = process.env.ITCH_CDP || 'http://127.0.0.1:9223';
const GAME_ID = (process.argv.find(argument => argument.startsWith('--game=')) || '').split('=')[1] || '5084705';
const DRY = process.argv.includes('--dry-run');
const OUT = path.resolve('artifacts');
const COVER = path.join(OUT, 'cover-630x500.png');
const SHOTS_DIR = path.join(OUT, 'shots');

// Order matters for the store page: menu, then the fight, then the systems.
const SHOT_ORDER = [
  '01-menu.png',
  '02-battle.png',
  '04-boss.png',
  '03-refit.png',
  '07-shipyard.png',
  '06-battle-mid.png',
  '05-result.png',
];

const shots = SHOT_ORDER.map(name => path.join(SHOTS_DIR, name)).filter(file => fs.existsSync(file));
console.log(`cover:  ${fs.existsSync(COVER) ? COVER : 'MISSING'}`);
console.log(`shots:  ${shots.length} files`);
for (const shot of shots) console.log(`  ${path.basename(shot)}`);

if (!DRY && !fs.existsSync(COVER)) { console.error('missing cover image'); process.exit(1); }

const browser = await chromium.connectOverCDP(ENDPOINT);
try {
  const page = await browser.contexts()[0].newPage();
  page.setDefaultTimeout(30000);
  await page.goto(`https://itch.io/game/edit/${GAME_ID}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[name="game[title]"]', { state: 'attached', timeout: 30000 });

  const before = await page.evaluate(() => ({
    coverSet: Boolean(document.querySelector('.cover_uploader_drop img, .cover_upload img')),
    screenshotCount: document.querySelectorAll('.screenshot_list li, .game_edit_screenshots_uploader_widget li').length,
  }));
  console.log('before:', JSON.stringify(before));

  if (DRY) {
    const controls = await page.evaluate(() => ({
      coverButtons: Array.from(document.querySelectorAll('.game_edit_cover_uploader_widget button, .cover_uploader_drop button')).map(el => (el.innerText || '').trim().slice(0, 24)),
      shotButtons: Array.from(document.querySelectorAll('.game_edit_screenshots_uploader_widget button, button.add_screenshot_btn')).map(el => (el.innerText || '').trim().slice(0, 24)),
    }));
    console.log('controls:', JSON.stringify(controls, null, 1));
    console.log('--dry-run: nothing uploaded');
  } else {
    // Cover first: the project highlights it in browse listings, so fail loudly here.
    const coverTrigger = page.locator('.game_edit_cover_uploader_widget button.button, .cover_uploader_drop button').first();
    if (!await coverTrigger.count()) throw new Error('cover upload button not found');
    const [coverChooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 20000 }), coverTrigger.click()]);
    await coverChooser.setFiles(COVER);
    console.log('cover handed over; waiting for processing');
    await page.waitForTimeout(9000);
    await page.screenshot({ path: path.join(OUT, 'itch-after-cover.png') });

    for (const shot of shots) {
      const trigger = page.locator('.game_edit_screenshots_uploader_widget button.button, button.add_screenshot_btn').first();
      if (!await trigger.count()) { console.log(`no screenshot button; stopping at ${path.basename(shot)}`); break; }
      try {
        const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 20000 }), trigger.click()]);
        await chooser.setFiles(shot);
        await page.waitForTimeout(6000);
        console.log(`uploaded ${path.basename(shot)}`);
      } catch (error) {
        console.log(`failed on ${path.basename(shot)}: ${error.name}`);
        break;
      }
    }

    const after = await page.evaluate(() => ({
      coverSet: Boolean(document.querySelector('.cover_uploader_drop img, .cover_upload img')),
      screenshotCount: document.querySelectorAll('.screenshot_list li, .game_edit_screenshots_uploader_widget li').length,
      screenshotSources: Array.from(document.querySelectorAll('.screenshot_list img, .game_edit_screenshots_uploader_widget img')).map(img => (img.src || '').split('/').pop()).slice(0, 10),
    }));
    console.log('after:', JSON.stringify(after, null, 1));
    await page.screenshot({ path: path.join(OUT, 'itch-after-media.png'), fullPage: true });
  }
} finally {
  await browser.close();
}
