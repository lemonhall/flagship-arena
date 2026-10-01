#!/usr/bin/env node
/**
 * Inspect the itch.io session in the dedicated debug Chrome.
 *
 * Connects over CDP to the Chrome instance started with --remote-debugging-port=9223, which
 * uses its own user-data-dir because Chrome 136+ refuses remote debugging on the default
 * profile. Read-only: lists pages and reports whether the session is signed in.
 *
 *   node tools/itch/session.mjs
 */
import { chromium } from '@playwright/test';

const ENDPOINT = process.env.ITCH_CDP || 'http://127.0.0.1:9223';

const browser = await chromium.connectOverCDP(ENDPOINT);
try {
  const contexts = browser.contexts();
  const pages = contexts.flatMap(context => context.pages());
  console.log(`endpoint ${ENDPOINT}: ${contexts.length} context(s), ${pages.length} page(s)`);
  for (const page of pages) console.log(`  ${page.url()}`);

  const page = pages.find(candidate => candidate.url().includes('itch.io')) || pages[0];
  if (!page) { console.log('no pages to inspect'); process.exit(0); }

  const state = await page.evaluate(() => {
    const text = (document.body?.innerText || '').replace(/\s+/g, ' ');
    return {
      url: location.href,
      title: document.title,
      hasLoginForm: Boolean(document.querySelector('form[action*="login"], input[name="username"]')),
      signedIn: /dashboard|log out|sign out/i.test(text),
      profileLink: document.querySelector('a[href^="/"][data-user_id], .user_avatar, a[href="/dashboard"]')?.getAttribute('href') || null,
      head: text.slice(0, 180),
    };
  });
  console.log('\npage state:');
  console.log(JSON.stringify(state, null, 2));
} finally {
  // Over CDP this detaches Playwright; it does not close the user's browser.
  await browser.close();
}
