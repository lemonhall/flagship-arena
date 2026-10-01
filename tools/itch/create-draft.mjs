#!/usr/bin/env node
/**
 * Create or update the itch.io project page for Flagship: Six Seas as a DRAFT.
 *
 *   node tools/itch/create-draft.mjs --dry-run          # dump select options, fill nothing
 *   node tools/itch/create-draft.mjs --fill             # fill and stop before submitting
 *   node tools/itch/create-draft.mjs --submit           # fill and save (creates the project)
 *   node tools/itch/create-draft.mjs --submit --game=5084705   # update an existing project
 *
 * Always use --game once the project exists: /game/new would create a second one.
 *
 * The itch UI renders in Chinese here (it follows the browser locale), so nothing is matched by
 * visible text. Three quirks are handled explicitly:
 *   - several inputs sit behind a JS editor and are not "visible" to Playwright, so writes fall
 *     back to setting the value through the DOM;
 *   - the selects are wrapped by selectize.js, which hides the native element, so they are set
 *     directly plus a change event (the native select is what the form submits);
 *   - the page holds more than one form (a search box comes first), so the save control is
 *     matched by its own class rather than by position.
 *
 * `game[type]` only offers "downloadable" here: itch's HTML kind is set later, when a build is
 * uploaded with "played in the browser" checked.
 *
 * Measured limit: short_text accepts 1–120 characters (itch rejects longer with a validation
 * error rather than truncating).
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { markdownToHtml } from './markdown.mjs';

const ENDPOINT = process.env.ITCH_CDP || 'http://127.0.0.1:9223';
const MODE = process.argv.includes('--dry-run') ? 'dry' : process.argv.includes('--submit') ? 'submit' : 'fill';
const GAME_ID = (process.argv.find(argument => argument.startsWith('--game=')) || '').split('=')[1]
  || process.env.ITCH_GAME_ID || null;
// --publish flips the project off its secret Draft URL onto the public store page.
const PUBLISH = process.argv.includes('--publish');
const ROOT = path.resolve('.');
const OUT = path.join(ROOT, 'artifacts');
fs.mkdirSync(OUT, { recursive: true });

const TITLE = 'Flagship: Six Seas';
const SHORT = 'Third-person 3D naval combat, free in your browser. Six routes, six pirate captains, no install.';
const TAGS = 'naval, 3d, action, browser, pirate, ship, singleplayer, short, fast-paced, arcade';

if (SHORT.length > 120) throw new Error(`short description is ${SHORT.length} chars; itch allows 120`);

/** One source of truth: the store description lives in the store-page doc. */
function description() {
  const source = fs.readFileSync(path.join(ROOT, 'docs/itch-store-page.md'), 'utf8');
  const start = source.indexOf('## Description');
  const end = source.indexOf('## Devlog plan');
  if (start < 0) throw new Error('no "## Description" section in docs/itch-store-page.md');
  return source.slice(start + '## Description'.length, end < 0 ? undefined : end).trim();
}

const target = GAME_ID ? `https://itch.io/game/edit/${GAME_ID}` : 'https://itch.io/game/new';
console.log(`target: ${target}`);

const browser = await chromium.connectOverCDP(ENDPOINT);
let page;
let keepOpen = MODE === 'submit';
try {
  const context = browser.contexts()[0];
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(target, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[name="game[title]"]', { timeout: 30000 });

  const setText = async (name, value) => {
    const loc = page.locator(`[name="${name}"]`);
    if (!await loc.count()) { console.log(`MISSING  ${name}`); return; }
    try {
      await loc.fill(value);
      console.log(`ok       ${name}  (${value.length} chars, visible)`);
    } catch (error) {
      await loc.evaluate((el, v) => {
        el.value = v;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, value);
      console.log(`js-fill  ${name}  (${value.length} chars, hidden: ${error.name})`);
    }
  };

  const setSelect = async (name, value) => {
    const result = await page.evaluate(({ name, value }) => {
      const el = document.querySelector(`select[name="${name}"]`);
      if (!el) return 'missing';
      if (!el.querySelector(`option[value="${value}"]`)) return 'no-option';
      el.value = value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return 'ok';
    }, { name, value });
    console.log(`${result === 'ok' ? 'ok      ' : 'skip    '} ${name}=${value}  (${result})`);
  };

  // "Kind Of Game" is a selectize widget whose options are only materialised in the DOM once
  // the dropdown is opened — the raw select holds just the current value until then, so it
  // cannot be set the way the other selects can. Open it, then click the option.
  const pickKindOfGame = async value => {
    const picker = page.locator('.game_type_picker .selectize-input').first();
    if (!await picker.count()) { console.log('skip     game[type]  (picker not found)'); return false; }
    await picker.click();
    await page.waitForTimeout(600);
    const option = page.locator(`.game_type_picker .selectize-dropdown-content .option[data-value="${value}"]`).first();
    if (!await option.count()) {
      console.log(`skip     game[type]=${value}  (option not offered)`);
      await page.keyboard.press('Escape').catch(() => {});
      return false;
    }
    await option.click();
    await page.waitForTimeout(500);
    const applied = await page.evaluate(() => document.querySelector('select[name="game[type]"]')?.value);
    console.log(`${applied === value ? 'ok      ' : 'warn    '} game[type]=${applied}`);
    return applied === value;
  };

  const setRadio = async (name, value) => {
    const loc = page.locator(`input[name="${name}"][value="${value}"]`);
    if (!await loc.count()) { console.log(`MISSING  ${name}=${value}`); return; }
    try { await loc.check(); console.log(`ok       ${name}=${value}`); }
    catch {
      await loc.evaluate(el => { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); });
      console.log(`js-check ${name}=${value}`);
    }
  };

  if (MODE === 'dry') {
    const dump = await page.evaluate(() => {
      const selects = {};
      for (const select of document.querySelectorAll('select[name]')) {
        selects[select.name] = Array.from(select.options).map(o => ({ value: o.value, label: o.innerText.trim() }));
      }
      const shortField = document.querySelector('[name="game[short_text]"]');
      return { selects, shortMaxLength: shortField?.getAttribute('maxlength') || null };
    });
    console.log(JSON.stringify(dump, null, 1));
  } else {
    await setText('game[title]', TITLE);
    await setText('game[short_text]', SHORT);
    // itch's description is a Redactor WYSIWYG over an HTML textarea and does not parse
    // markdown, so the store copy is converted to HTML first — and mirrored into the editable
    // element too, in case Redactor syncs its own content over the textarea on submit.
    const descriptionHtml = markdownToHtml(description());
    await setText('game[description]', descriptionHtml);
    await page.evaluate(html => {
      const editable = document.querySelector('.redactor-editor, [contenteditable="true"]');
      if (editable) editable.innerHTML = html;
    }, descriptionHtml);
    await setText('game[tags]', TAGS);
    await setSelect('game[user_classification]', 'game');
    await pickKindOfGame('html');
    await setSelect('game[release_status]', 'released');
    await setSelect('game[genre]', 'action');
    // Both AI radios start unchecked, so this must be explicit. The project contains no
    // generative-AI output: the ships are modelled in Blender and the music is CC0.
    await setRadio('ai_disclosure[ai_generated]', 'no');
    await setRadio('game[community_type]', 'topic');
    await setRadio('game[published]', PUBLISH ? 'published' : 'draft');

    const values = await page.evaluate(() => ({
      title: document.querySelector('[name="game[title]"]')?.value,
      shortLength: document.querySelector('[name="game[short_text]"]')?.value?.length,
      descriptionLength: document.querySelector('[name="game[description]"]')?.value?.length,
      tags: document.querySelector('[name="game[tags]"]')?.value,
      aiNo: document.querySelector('input[name="ai_disclosure[ai_generated]"][value="no"]')?.checked,
      draft: document.querySelector('input[name="game[published]"][value="draft"]')?.checked,
      community: document.querySelector('input[name="game[community_type]"]:checked')?.value,
    }));
    console.log('verified:', JSON.stringify(values));

    await page.screenshot({ path: path.join(OUT, `itch-${MODE}.png`), fullPage: true });
    console.log(`screenshot: artifacts/itch-${MODE}.png`);

    if (MODE === 'submit') {
      // The project form's submit control is <button class="button save_btn">. Matching the first
      // generic submit button hits the search form instead and silently does nothing.
      await page.locator('button.save_btn').first().click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(4000);
      console.log(`after submit: ${page.url()}`);
      const messages = await page.evaluate(() => Array.from(
        document.querySelectorAll('[class*=error], [class*=Error], .form_errors, .notification, .flash, .alert')
      ).map(node => (node.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 220)).filter(Boolean).slice(0, 12));
      console.log('page messages:', JSON.stringify(messages, null, 1));
      await page.screenshot({ path: path.join(OUT, 'itch-saved.png'), fullPage: true });
    } else {
      console.log('--fill: stopping before submit so the result can be reviewed');
    }
  }
} finally {
  // Keep the tab open when submitting so a rejected form can be inspected in place.
  if (page && !keepOpen) await page.close().catch(() => {});
  await browser.close();
}
