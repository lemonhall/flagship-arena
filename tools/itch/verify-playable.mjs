#!/usr/bin/env node
/**
 * Prove the game actually runs inside itch's iframe.
 *
 *   node tools/itch/verify-playable.mjs
 *
 * This is the real acceptance test for the relative-path fix: itch serves the build from
 * https://html.itch.zone/html/<id>/index.html, where a root-absolute reference fails with 403
 * rather than 404. Loading the store page and driving the embedded frame is the only way to
 * see it, and the frame is cross-origin, so it has to be reached as a frame rather than by URL.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const ENDPOINT = process.env.ITCH_CDP || 'http://127.0.0.1:9223';
const STORE_URL = process.env.ITCH_STORE_URL || 'https://lemonhall.itch.io/flagship-six-seas';
const OUT = path.resolve('artifacts');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP(ENDPOINT);
try {
  // --english runs in a fresh, signed-out context with an English locale, which is how the
  // storefront audience arrives: the game picks its language from navigator.language.
  const english = process.argv.includes('--english');
  const context = english
    ? await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 900 } })
    : browser.contexts()[0];
  const page = await context.newPage();
  const failures = [];
  page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));

  await page.goto(STORE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  const launch = page.locator('button:has-text("Run game"), .iframe_placeholder, .play_btn, .load_iframe_btn').first();
  if (await launch.count()) {
    await launch.click({ timeout: 10000 }).catch(error => console.log(`launch click: ${error.name}`));
    await page.waitForTimeout(6000);
  } else {
    console.log('no launch control found');
  }

  const frames = page.frames().map(frame => frame.url());
  console.log('frames on page:');
  for (const url of frames) console.log(`  ${url}`);

  const frame = page.frames().find(candidate => /html\.itch\.zone|\/html\//.test(candidate.url()));
  if (!frame) {
    console.log('\nno itch game frame appeared');
  } else {
    console.log(`\ngame frame: ${frame.url()}`);
    await frame.waitForSelector('#loading', { state: 'hidden', timeout: 60000 })
      .catch(() => console.log('note: the loading overlay never hid'));
    const state = await frame.evaluate(() => ({
      title: document.title,
      lang: document.documentElement.lang,
      menuVisible: !document.getElementById('menu')?.hidden,
      startLabel: document.getElementById('start')?.innerText?.trim() || null,
      loadingHidden: Boolean(document.getElementById('loading')?.hidden),
      hasBattleCanvas: Boolean(document.getElementById('battle')),
      hasHud: Boolean(document.getElementById('hud')),
    }));
    console.log('inside the frame:', JSON.stringify(state, null, 1));

    // Start a real run inside itch's iframe.
    if (state.menuVisible) {
      await frame.locator('#start').click({ timeout: 15000 }).catch(error => console.log(`start click: ${error.name}`));
      await frame.waitForTimeout(12000);
      const playing = await frame.evaluate(() => ({
        hudVisible: !document.getElementById('hud')?.hidden,
        hull: document.getElementById('hp-text')?.innerText || null,
        ammo: document.getElementById('ammo-text')?.innerText || null,
        wave: document.getElementById('wave-label')?.innerText || null,
      }));
      console.log('after starting a run:', JSON.stringify(playing, null, 1));
    }
  }

  console.log('\nfailed requests:', JSON.stringify(failures.slice(0, 14), null, 1));
  await page.screenshot({ path: path.join(OUT, 'itch-playing.png') });
  console.log('screenshot: artifacts/itch-playing.png');
} finally {
  await browser.close();
}
