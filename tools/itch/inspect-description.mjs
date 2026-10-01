#!/usr/bin/env node
/**
 * Inspect the description field on the itch edit page.
 *
 *   node tools/itch/inspect-description.mjs [--game=5084705]
 *
 * The write step had to fall back to setting the hidden input directly, which suggests itch
 * drives this field with its own editor. If so, the stored text never went through that
 * editor's markdown handling and renders as literal markdown on the store page.
 */
import { chromium } from '@playwright/test';

const ENDPOINT = process.env.ITCH_CDP || 'http://127.0.0.1:9223';
const GAME_ID = (process.argv.find(argument => argument.startsWith('--game=')) || '').split('=')[1] || '5084705';

const browser = await chromium.connectOverCDP(ENDPOINT);
try {
  const context = browser.contexts()[0];

  const edit = await context.newPage();
  edit.setDefaultTimeout(20000);
  await edit.goto(`https://itch.io/game/edit/${GAME_ID}`, { waitUntil: 'domcontentloaded' });
  // The backing textarea is hidden behind itch's editor, so attached is the right state.
  await edit.waitForSelector('[name="game[description]"]', { state: 'attached', timeout: 30000 });

  const editor = await edit.evaluate(() => {
    const field = document.querySelector('[name="game[description]"]');
    const known = ['.CodeMirror', '.EasyMDEContainer', '.mde', '.redactor', '.tox-tinymce', '.trumbowyg', '[contenteditable="true"]'];
    const container = field?.closest('.input_wrapper, .form_section, .input, div');
    return {
      fieldTag: field?.tagName || null,
      fieldClass: String(field?.className || '').slice(0, 80),
      fieldVisible: Boolean(field?.offsetWidth || field?.offsetHeight),
      fieldValueHead: (field?.value || '').slice(0, 90),
      editorsFound: known.filter(selector => document.querySelector(selector)),
      containerHtml: (container?.innerHTML || '').slice(0, 900),
    };
  });
  console.log('edit page description field:');
  console.log(JSON.stringify(editor, null, 1));

  const publicPage = await context.newPage();
  await publicPage.goto(`https://lemonhall.itch.io/`, { waitUntil: 'domcontentloaded' });
  await publicPage.waitForTimeout(500);
  const store = await publicPage.goto(`https://lemonhall.itch.io/flagship-six-seas`, { waitUntil: 'domcontentloaded' });
  await publicPage.waitForTimeout(2000);
  const rendered = await publicPage.evaluate(() => {
    const body = document.querySelector('.formatted_text, .game_description, #game_description, .user_formatted');
    return {
      status: document.title,
      containerClass: String(body?.className || ''),
      htmlHead: (body?.innerHTML || '').replace(/\s+/g, ' ').slice(0, 400),
      hasStrongTag: Boolean(body?.querySelector('strong')),
      hasTable: Boolean(body?.querySelector('table')),
      literalMarkdown: /\*\*|^###|\|\s*---/m.test(body?.innerText || ''),
    };
  });
  console.log(`\nstore page (status ${store?.status()}):`);
  console.log(JSON.stringify(rendered, null, 1));
} finally {
  await browser.close();
}
