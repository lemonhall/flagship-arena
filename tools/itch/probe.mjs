#!/usr/bin/env node
/**
 * Inspect the live itch "new project" tab without reloading it, so a filled-but-unsubmitted
 * form stays exactly as it is. Read-only.
 *
 *   node tools/itch/probe.mjs
 */
import { chromium } from '@playwright/test';

const ENDPOINT = process.env.ITCH_CDP || 'http://127.0.0.1:9223';

const browser = await chromium.connectOverCDP(ENDPOINT);
try {
  const pages = browser.contexts().flatMap(context => context.pages());
  console.log(`pages: ${pages.length}`);
  for (const candidate of pages) console.log(`  ${candidate.url()}`);

  const page = pages.find(candidate => candidate.url().includes('/game/new'));
  if (!page) { console.log('\nno /game/new tab is open'); process.exit(0); }

  const report = await page.evaluate(() => {
    const forms = Array.from(document.querySelectorAll('form')).map((form, index) => ({
      index,
      id: form.id || null,
      action: form.getAttribute('action'),
      method: form.method,
      hasTitle: Boolean(form.querySelector('[name="game[title]"]')),
      controls: Array.from(form.querySelectorAll('button, input[type=submit], input[type=button], a.button'))
        .map(el => ({
          tag: el.tagName.toLowerCase(),
          cls: String(el.className || '').slice(0, 50),
          type: el.type || '',
          text: (el.innerText || el.value || '').trim().slice(0, 30),
          visible: Boolean(el.offsetWidth || el.offsetHeight),
          outer: el.outerHTML.slice(0, 150),
        })),
    }));

    // Anything on the page that looks like a save control, outside a form too.
    const looseSave = Array.from(document.querySelectorAll('button, input[type=submit], a'))
      .filter(el => /保存|save|提交|publish/i.test(el.innerText || el.value || ''))
      .map(el => ({ tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 40), text: (el.innerText || el.value || '').trim().slice(0, 30) }));

    return { forms, looseSave };
  });

  console.log('\nforms:');
  console.log(JSON.stringify(report.forms, null, 1));
  console.log('\nsave-like controls anywhere:');
  console.log(JSON.stringify(report.looseSave, null, 1));
} finally {
  await browser.close();
}
