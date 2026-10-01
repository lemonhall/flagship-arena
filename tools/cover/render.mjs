#!/usr/bin/env node
/**
 * Render the itch.io cover image at exactly 630x500 (the size itch's own moderators quote;
 * the documentation page does not publish one).
 *
 *   node tools/cover/render.mjs
 *
 * Output goes to artifacts/, which is gitignored: the cover is a build product of
 * cover.html plus an evidence screenshot, not a hand-edited binary.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const WIDTH = 630;
const HEIGHT = 500;
const source = path.resolve('tools/cover/cover.html');
const outDir = path.resolve('artifacts');
const target = path.join(outDir, 'cover-630x500.png');

if (!fs.existsSync(source)) { console.error(`missing ${source}`); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(source).href);
  await page.waitForLoadState('networkidle');
  // The screenshot must not be captured before the ship art has decoded.
  await page.waitForFunction(() => {
    const shot = document.querySelector('.shot');
    return shot?.complete && shot.naturalWidth > 0;
  }, { timeout: 15000 });
  await page.screenshot({ path: target, type: 'png' });
  const size = fs.statSync(target).size;
  console.log(`cover written: ${path.relative(process.cwd(), target)} (${WIDTH}x${HEIGHT}, ${(size / 1024).toFixed(0)} KiB)`);
} finally {
  await browser.close();
}
