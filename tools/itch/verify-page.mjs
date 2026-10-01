#!/usr/bin/env node
/**
 * Read back what itch actually stored for the project, and check the public URL.
 *
 *   node tools/itch/verify-page.mjs [--game=5084705]
 *
 * Never assume a form submit worked: this reloads the edit page from scratch and reports the
 * persisted values, then tries the public store URL.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const ENDPOINT = process.env.ITCH_CDP || 'http://127.0.0.1:9223';
const GAME_ID = (process.argv.find(argument => argument.startsWith('--game=')) || '').split('=')[1]
  || process.env.ITCH_GAME_ID || '5084705';
const OUT = path.resolve('artifacts');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP(ENDPOINT);
try {
  const context = browser.contexts()[0];
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  await page.goto(`https://itch.io/game/edit/${GAME_ID}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[name="game[title]"]', { timeout: 30000 });

  const stored = await page.evaluate(() => ({
    title: document.querySelector('[name="game[title]"]')?.value,
    slug: document.querySelector('[name="game[slug]"]')?.value,
    short: document.querySelector('[name="game[short_text]"]')?.value,
    shortLength: document.querySelector('[name="game[short_text]"]')?.value?.length,
    descriptionLength: document.querySelector('[name="game[description]"]')?.value?.length,
    tags: document.querySelector('[name="game[tags]"]')?.value,
    aiDisclosure: document.querySelector('input[name="ai_disclosure[ai_generated]"]:checked')?.value || null,
    published: document.querySelector('input[name="game[published]"]:checked')?.value || null,
    community: document.querySelector('input[name="game[community_type]"]:checked')?.value || null,
    kindOfProject: document.querySelector('select[name="game[type]"]')?.value || null,
    releaseStatus: document.querySelector('[name="game[release_status]"]')?.value || null,
  }));
  console.log('stored on itch:');
  console.log(JSON.stringify(stored, null, 1));

  if (stored.slug) {
    const publicUrl = `https://lemonhall.itch.io/${stored.slug}`;
    const publicPage = await context.newPage();
    const response = await publicPage.goto(publicUrl, { waitUntil: 'domcontentloaded' });
    await publicPage.waitForTimeout(2000);
    console.log(`\npublic page: ${publicUrl}`);
    console.log(`  status: ${response?.status()}`);
    console.log(`  title : ${await publicPage.title()}`);
    const visible = await publicPage.evaluate(() => ({
      heading: document.querySelector('h1')?.innerText?.trim().slice(0, 80) || null,
      hasUploadPrompt: /upload|上传/i.test(document.body?.innerText || ''),
      // A browser-playable project shows a launch frame / play button instead of download links.
      playSignals: {
        button: Boolean(document.querySelector('.play_btn, .button.play_btn, a.play_btn')),
        iframeFrame: Boolean(document.querySelector('.iframe_placeholder, .game_frame, iframe#game_frame')),
        runInBrowser: /run in browser|play in browser|在浏览器中运行|点击运行/i.test(document.body?.innerText || ''),
      },
      buttons: Array.from(document.querySelectorAll('button, a.button')).map(el => (el.innerText || '').trim().slice(0, 22)).filter(Boolean).slice(0, 10),
      bodyHead: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 260),
    }));
    console.log('  page  :', JSON.stringify(visible, null, 1));
    await publicPage.screenshot({ path: path.join(OUT, 'itch-project-public.png'), fullPage: true });
    console.log('  screenshot: artifacts/itch-project-public.png');
  }
} finally {
  await browser.close();
}
