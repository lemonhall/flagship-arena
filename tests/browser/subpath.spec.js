import { test, expect } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

// itch.io serves an HTML5 game from https://html.itch.zone/html/<id>/index.html, i.e. from a
// sub-path of a host the game does not control. This suite serves the production `dist` from
// a sub-path and drives a real browser against it, because that is the only way to reproduce
// the CDN environment before uploading. Absolute references fail there with 403, and the CDN
// is case-sensitive while the local filesystem is not.

const DIST = path.resolve('dist');
const PREFIX = '/sub';
const built = fs.existsSync(DIST);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg',
};

let server;
let origin;

test.beforeAll(async () => {
  if (!built) return;
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://placeholder');
    if (!url.pathname.startsWith(`${PREFIX}/`)) { res.writeHead(404).end('outside the game prefix'); return; }
    let relative = decodeURIComponent(url.pathname.slice(PREFIX.length));
    if (relative.endsWith('/')) relative += 'index.html';
    const file = path.join(DIST, relative);
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}${PREFIX}`;
});

test.afterAll(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
});

test('the production build boots from a sub-path with no failed requests', async ({ page }) => {
  test.skip(!built, 'dist/ not built — run `npm run build` first');
  const failures = [];
  page.on('response', response => {
    if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
  });
  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));

  await page.goto(`${origin}/`);
  await expect(page.locator('#loading')).toBeHidden({ timeout: 45000 });
  await expect(page.locator('#start')).toBeVisible();
  expect(failures, `requests failed under a sub-path:\n${failures.join('\n')}`).toEqual([]);
});

test('ship models and the BGM actually load from the sub-path', async ({ page }) => {
  test.skip(!built, 'dist/ not built — run `npm run build` first');
  const loaded = [];
  page.on('response', response => {
    if (response.status() === 200) loaded.push(new URL(response.url()).pathname);
  });
  await page.goto(`${origin}/?lang=en`);
  await expect(page.locator('#loading')).toBeHidden({ timeout: 45000 });
  await page.locator('#start').click();
  await expect(page.locator('#hud')).toBeVisible({ timeout: 45000 });

  const glbs = loaded.filter(p => p.endsWith('.glb'));
  expect(glbs.length, `no ship models were fetched; got ${loaded.join(', ')}`).toBeGreaterThan(0);
  expect(loaded.some(p => p.endsWith('.mp3'))).toBe(true);
  expect(loaded.join(' ')).not.toMatch(/^\/(assets|audio)\//);
});
