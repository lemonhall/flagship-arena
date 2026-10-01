#!/usr/bin/env node
/**
 * Capture the English storefront screenshots used on itch.io.
 *
 *   node tools/cover/capture.mjs
 *
 * evidence/ holds Chinese screenshots, because the browser test suite runs with a zh-CN
 * locale so its Chinese assertions stay meaningful. The itch storefront is English, so the
 * marketing shots have to be captured separately against ?lang=en. This boots vite dev (the
 * __arena acceptance driver only exists in dev builds), steps the real game in one-second
 * slices, and writes PNGs to artifacts/shots/.
 *
 * The cover background does not depend on reaching the boss: a HUD-free battle frame is
 * always taken at a fixed step, and a boss frame is captured too when one appears.
 */
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const PORT = 4188;
const ROOT = path.resolve('.');
const OUT = path.resolve('artifacts/shots');
const BASE = `http://127.0.0.1:${PORT}`;
const VIEWPORT = { width: 1440, height: 900 };
const SLICE = 1;           // simulated seconds per step
const MAX_STEPS = 140;
const CLEAN_AT = 26;       // step at which the HUD-free cover frame is taken

fs.mkdirSync(OUT, { recursive: true });

const vite = spawn('npm.cmd', ['run', 'dev', '--', '--port', String(PORT), '--strictPort'], {
  cwd: ROOT, stdio: 'ignore', shell: true, windowsHide: true,
});

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const response = await fetch(BASE);
      if (response.ok) return;
    } catch { /* not listening yet */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('vite dev server did not come up');
}

const written = [];
const trace = [];
let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: VIEWPORT, locale: 'en-US' });

  const shoot = async name => {
    await page.screenshot({ path: path.join(OUT, name) });
    written.push(name);
  };
  const hud = visible => page.evaluate(show => {
    document.getElementById('hud').style.display = show ? '' : 'none';
  }, visible);

  await page.goto(`${BASE}/?lang=en&test=1`);
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 60000 });
  await page.waitForTimeout(600);
  await shoot('01-menu.png');

  await page.click('#start');
  await page.waitForSelector('#hud', { state: 'visible', timeout: 60000 });
  await page.waitForTimeout(1200);
  await shoot('02-battle.png');

  const seen = new Set();
  let lastLogged = '';
  for (let step = 0; step < MAX_STEPS; step++) {
    const state = await page.evaluate(() => ({
      mode: window.__arena.mode,
      boss: Boolean(window.__arena.sim.units.find(u => u.boss && u.hp > 0)),
      wave: window.__arena.sim.wave,
      phase: window.__arena.sim.bossPhase,
    }));
    const line = `${state.mode}${state.boss ? '+boss' : ''}:w${state.wave}`;
    if (line !== lastLogged) { trace.push(`${step}=${line}`); lastLogged = line; }

    if (state.mode === 'upgrade') {
      if (!seen.has('upgrade')) { seen.add('upgrade'); await shoot('03-refit.png'); }
      // The refit popup pauses the simulation and advance() only steps during battle, so a card
      // has to be picked before the run can continue. The selection guard needs the click to
      // settle, same as the real input path.
      await page.waitForTimeout(800);
      await page.locator('.upgrade-card').first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(250);
      continue;
    }

    if (state.mode === 'result') {
      if (!seen.has('result')) {
        seen.add('result');
        await page.waitForSelector('#result', { state: 'visible' });
        await page.waitForTimeout(400);
        await shoot('05-result.png');
      }
      break;
    }

    if (state.mode !== 'battle') { await page.waitForTimeout(200); continue; }

    if (!seen.has('mid') && step > 3) { seen.add('mid'); await shoot('06-battle-mid.png'); }

    if (state.boss && !seen.has('boss')) {
      seen.add('boss');
      await shoot('04-boss.png');
      await hud(false);
      await page.waitForTimeout(350);
      await shoot('09-boss-clean.png');
      await hud(true);
      await page.waitForTimeout(200);
    }

    if (step === CLEAN_AT && !seen.has('clean')) {
      seen.add('clean');
      await hud(false);
      await page.waitForTimeout(350);
      await shoot('08-clean.png');
      await hud(true);
      await page.waitForTimeout(200);
    }

    if (seen.has('boss') && seen.has('result')) break;
    await page.evaluate(seconds => window.__arena.advance(seconds), SLICE);
    await page.waitForTimeout(60);
  }

  // Menu again with the shipyard open, for the progression shot.
  await page.goto(`${BASE}/?lang=en&test=1`);
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 60000 });
  await page.click('#shipyard');
  await page.waitForSelector('#shipyard-menu', { state: 'visible' });
  await page.waitForTimeout(400);
  await shoot('07-shipyard.png');

  console.log(`captured ${written.length} shots into artifacts/shots:\n  ${written.join('\n  ')}`);
  console.log(`state trace: ${trace.join('  ')}`);
  const missing = ['08-clean.png'].filter(name => !written.includes(name));
  if (missing.length) console.log(`WARNING: missing cover background (${missing.join(', ')})`);
} finally {
  if (browser) await browser.close();
  // `shell: true` wraps vite in a cmd.exe layer, so killing the handle alone leaves the dev
  // server and its esbuild child alive, still holding the port and the project directory.
  if (vite.pid && process.platform === 'win32') {
    try { execSync(`taskkill /pid ${vite.pid} /T /F`, { stdio: 'ignore' }); } catch { /* already gone */ }
  } else {
    vite.kill();
  }
  await new Promise(resolve => setTimeout(resolve, 500));
}
