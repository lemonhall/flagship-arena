#!/usr/bin/env node
/**
 * Upload the browser build to the itch project page and mark it playable in the browser.
 *
 *   node tools/itch/upload-build.mjs --dry-run [--game=5084705]   # list upload controls
 *   node tools/itch/upload-build.mjs [--game=5084705]             # upload and set HTML kind
 *
 * The zip must have index.html at its root and relative asset paths only; `npm run verify:itch`
 * checks both before this runs.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const ENDPOINT = process.env.ITCH_CDP || 'http://127.0.0.1:9223';
const GAME_ID = (process.argv.find(argument => argument.startsWith('--game=')) || '').split('=')[1] || '5084705';
const DRY = process.argv.includes('--dry-run');
const ZIP = path.resolve('artifacts/flagship-arena-itch.zip');
const OUT = path.resolve('artifacts');
fs.mkdirSync(OUT, { recursive: true });

if (!DRY && !fs.existsSync(ZIP)) { console.error(`missing ${ZIP} — run npm run build and repackage`); process.exit(1); }

const browser = await chromium.connectOverCDP(ENDPOINT);
let keepOpen = !DRY;
let page;
try {
  const context = browser.contexts()[0];
  page = await context.newPage();
  page.setDefaultTimeout(30000);
  await page.goto(`https://itch.io/game/edit/${GAME_ID}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[name="game[title]"]', { state: 'attached', timeout: 30000 });

  const controls = await page.evaluate(() => {
    const fileRows = Array.from(document.querySelectorAll('.file_list .uploader')).map(row => ({
      uploadId: row.querySelector('input[name$="[position]"]')?.name?.match(/upload\[(\d+)\]/)?.[1] || null,
      name: row.querySelector('.upload_display_name')?.innerText?.trim() || null,
      // Every control in the row, with its label: the browser-play toggle is buried after the
      // platform pickers, past where a truncated dump would cut off.
      controls: Array.from(row.querySelectorAll('input, select, button, a')).map(el => ({
        tag: el.tagName.toLowerCase(),
        type: el.type || '',
        name: el.name || '',
        value: String(el.value || '').slice(0, 30),
        checked: el.type === 'checkbox' || el.type === 'radio' ? el.checked : null,
        text: (el.innerText || '').trim().slice(0, 28),
        label: (el.labels?.[0]?.innerText || el.closest('label')?.innerText || el.parentElement?.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 46),
      })),
    }));
    return { fileRows };
  });
  console.log('uploaded rows:', JSON.stringify(controls, null, 1));

  const kind = await page.evaluate(() => {
    const select = document.querySelector('select[name="game[type]"]');
    const container = select?.closest('.input_wrapper, .form_section, .input_row, section, div');
    return {
      selectOuter: select?.outerHTML?.slice(0, 500) || null,
      containerHtml: (container?.outerHTML || '').replace(/\s+/g, ' ').slice(0, 1500),
      typeLabels: Array.from(document.querySelectorAll('label, .label, h3, .header, .form_header, .selected_option_name'))
        .map(el => (el.innerText || '').trim().replace(/\s+/g, ' '))
        .filter(text => /kind of project|项目类型|type of project|HTML5|browser|浏览器|executable|下载/i.test(text))
        .slice(0, 12),
    };
  });
  console.log('kind-of-project area:', JSON.stringify(kind, null, 1));

  // The Kind Of Game picker is a selectize widget whose raw select showed a single option.
  // Open it: selectize may fetch its option list lazily, which would explain the empty
  // dropdown content seen in the HTML dump.
  const picker = page.locator('.game_type_picker .selectize-input').first();
  if (await picker.count()) {
    await picker.click();
    await page.waitForTimeout(1800);
    const options = await page.evaluate(() => ({
      rawOptions: Array.from(document.querySelectorAll('select[name="game[type]"] option')).map(o => `${o.value}:${o.innerText.trim()}`),
      dropdownOptions: Array.from(document.querySelectorAll('.game_type_picker .selectize-dropdown-content .option')).map(o => `${o.getAttribute('data-value')}:${(o.innerText || '').trim().slice(0, 46)}`),
      dropdownVisible: Boolean(document.querySelector('.game_type_picker .selectize-dropdown')?.offsetHeight),
    }));
    console.log('kind picker opened:', JSON.stringify(options, null, 1));
  }

  // itch hides less common per-file actions behind the row's "…" button.
  const more = page.locator('.file_list .more_btn').first();
  if (await more.count()) {
    await more.click();
    await page.waitForTimeout(900);
    const menu = await page.evaluate(() => Array.from(document.querySelectorAll('[class*=popup], [class*=dropdown], [class*=menu], .tooltip'))
      .filter(el => el.offsetWidth || el.offsetHeight)
      .map(el => (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 400)).filter(Boolean).slice(0, 4));
    console.log('more-menu:', JSON.stringify(menu, null, 1));
    await page.keyboard.press('Escape').catch(() => {});
  }
  console.log(`build zip: ${fs.existsSync(ZIP) ? `${(fs.statSync(ZIP).size / 1024 / 1024).toFixed(2)} MiB` : 'MISSING'}`);
  console.log('upload controls:', JSON.stringify(controls, null, 1));

  if (DRY) { console.log('\n--dry-run: nothing uploaded'); }
  else {
    // There is no file input until the button is pressed: it opens the native file chooser.
    const trigger = page.locator('.add_file_btn_outer button.button').first();
    if (!await trigger.count()) throw new Error('upload button not found');
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 20000 }),
      trigger.click(),
    ]);
    await chooser.setFiles(ZIP);
    console.log('zip handed to itch; waiting for it to be processed');
    await page.waitForTimeout(25000);
    await page.screenshot({ path: path.join(OUT, 'itch-after-upload.png'), fullPage: true });
    console.log(`url now: ${page.url()}`);
    const state = await page.evaluate(() => ({
      kindOfProject: document.querySelector('[name="game[type]"]')?.value || null,
      playInBrowser: Array.from(document.querySelectorAll('input[type=checkbox]')).filter(el => /browser|browser_/i.test(el.name)).map(el => ({ name: el.name, checked: el.checked })),
      uploadRows: Array.from(document.querySelectorAll('[class*=upload], .upload_list, .file_row')).map(el => (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 90)).filter(Boolean).slice(0, 6),
    }));
    console.log('after-upload state:', JSON.stringify(state, null, 1));
  }
} finally {
  if (page && !keepOpen) await page.close().catch(() => {});
  await browser.close();
}
