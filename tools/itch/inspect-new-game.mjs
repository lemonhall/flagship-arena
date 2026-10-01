#!/usr/bin/env node
/**
 * Open itch.io's "new project" form in a new tab and dump its field structure.
 *
 * Read-only reconnaissance: it never submits. The dump tells us the exact field names to
 * drive in the create step, instead of guessing at itch's markup.
 *
 *   node tools/itch/inspect-new-game.mjs
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const ENDPOINT = process.env.ITCH_CDP || 'http://127.0.0.1:9223';
const OUT = path.resolve('artifacts');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP(ENDPOINT);
try {
  const context = browser.contexts()[0];
  const page = await context.newPage();
  await page.goto('https://itch.io/game/new', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  console.log(`url   : ${page.url()}`);
  console.log(`title : ${await page.title()}`);

  const fields = await page.evaluate(() => {
    const rows = [];
    for (const el of document.querySelectorAll('input, select, textarea, button')) {
      const label = el.labels?.[0]?.innerText
        || el.closest('div,li,section')?.querySelector('label,h3,h4,strong')?.innerText
        || '';
      rows.push({
        tag: el.tagName.toLowerCase(),
        type: el.type || '',
        name: el.name || '',
        id: el.id || '',
        text: (el.innerText || '').slice(0, 40).replace(/\s+/g, ' '),
        value: (el.type === 'checkbox' || el.type === 'radio') ? Boolean(el.checked) : String(el.value || '').slice(0, 50),
        label: label.slice(0, 70).replace(/\s+/g, ' '),
      });
    }
    return rows;
  });

  const file = path.join(OUT, 'itch-new-game-fields.json');
  fs.writeFileSync(file, JSON.stringify(fields, null, 1), 'utf8');
  console.log(`\n${fields.length} fields written to ${path.relative(process.cwd(), file)}`);

  const named = fields.filter(f => f.name);
  console.log('\nfields carrying a name attribute:');
  for (const f of named) console.log(`  ${f.tag}[${f.type}] name=${f.name}  label="${f.label}"`);
} finally {
  await browser.close();
}
