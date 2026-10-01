#!/usr/bin/env node
/**
 * Render the X account artwork: a 512x512 avatar and a 1500x500 header.
 *
 *   node tools/cover/render-brand.mjs
 *
 * Depends on artifacts/shots/04-boss.png, so run `npm run shots` first.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const OUT = path.resolve('artifacts');
fs.mkdirSync(OUT, { recursive: true });

const jobs = [
  { source: 'tools/cover/avatar.html', width: 512, height: 512, target: 'x-avatar-512.png' },
  { source: 'tools/cover/banner.html', width: 1500, height: 500, target: 'x-header-1500x500.png' },
];

const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const job of jobs) {
    const source = path.resolve(job.source);
    if (!fs.existsSync(source)) { console.error(`missing ${job.source}`); process.exitCode = 1; continue; }
    const page = await browser.newPage({ viewport: { width: job.width, height: job.height }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(source).href);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    const target = path.join(OUT, job.target);
    await page.screenshot({ path: target });
    await page.close();
    console.log(`wrote artifacts/${job.target} (${job.width}x${job.height}, ${(fs.statSync(target).size / 1024).toFixed(0)} KiB)`);
  }
} finally {
  await browser.close();
}
