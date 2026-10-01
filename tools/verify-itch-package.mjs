#!/usr/bin/env node
/**
 * Pre-flight check for the itch.io HTML5 upload. Run after `npm run build`, before zipping.
 *
 *   node tools/verify-itch-package.mjs
 *
 * Two failures this catches that a local `npm run dev` never will:
 *
 *   1. itch.io serves the game from https://html.itch.zone/html/<id>/index.html, so any
 *      root-absolute reference ("/assets/x.js") resolves against the CDN root and fails
 *      with 403 — not 404. Only relative references survive.
 *   2. The itch CDN is case-sensitive, while Windows and macOS are not. A reference that
 *      differs from the file on disk only in case works everywhere locally and 403s in
 *      production, so every reference is resolved against the exact on-disk name.
 */
import fs from 'node:fs';
import path from 'node:path';

const DIST = path.resolve('dist');
const LIMITS = { files: 1000, totalBytes: 500 * 1024 * 1024, singleBytes: 200 * 1024 * 1024, pathChars: 240 };
const TEXT = new Set(['.html', '.js', '.css', '.json', '.webmanifest', '.svg']);
const ASSET = /\.(js|css|mjs|json|glb|mp3|svg|png|jpg|jpeg|webp|webmanifest|wasm|txt|ico|woff2?)$/i;

const errors = [];
const warnings = [];

if (!fs.existsSync(DIST)) {
  console.error('dist/ not found - run `npm run build` first.');
  process.exit(1);
}

/** Collect every file using its exact on-disk name, so case is preserved. */
const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else files.push(full);
  }
})(DIST);

const rel = file => path.relative(DIST, file).split(path.sep).join('/');
const byExactPath = new Map(files.map(file => [rel(file), file]));
const totalBytes = files.reduce((sum, file) => sum + fs.statSync(file).size, 0);

console.log(`dist: ${files.length} files, ${(totalBytes / 1024 / 1024).toFixed(2)} MiB`);

// --- structure -------------------------------------------------------------------------
const indexFiles = files.filter(file => path.basename(file).toLowerCase() === 'index.html');
if (indexFiles.length !== 1) errors.push(`expected exactly one index.html, found ${indexFiles.length}`);
else if (path.dirname(indexFiles[0]) !== DIST) errors.push(`index.html must sit at the zip root, found at ${rel(indexFiles[0])}`);

if (files.length > LIMITS.files) errors.push(`file count ${files.length} exceeds the itch limit of ${LIMITS.files}`);
for (const file of files) {
  const size = fs.statSync(file).size;
  if (size > LIMITS.singleBytes) errors.push(`${rel(file)} is ${(size / 1024 / 1024).toFixed(1)} MiB, over the 200 MiB per-file limit`);
  if (rel(file).length > LIMITS.pathChars) errors.push(`${rel(file)} exceeds the ${LIMITS.pathChars}-character path limit`);
}
if (totalBytes > LIMITS.totalBytes) errors.push(`total size exceeds the 500 MiB itch limit`);

// --- references ------------------------------------------------------------------------
const referenced = new Set();

function checkReference(from, ref, base) {
  const clean = ref.split('#')[0].split('?')[0];
  if (!clean) return;
  if (/^(https?:)?\/\//i.test(clean) || /^(data|blob|mailto):/i.test(clean)) return;

  if (clean.startsWith('/')) {
    errors.push(`${from}: root-absolute reference "${ref}" will 403 on itch.io (must be relative)`);
    return;
  }

  // A JS chunk imports its siblings relative to its own directory, while runtime asset
  // strings compiled from import.meta.env.BASE_URL resolve against the *document* URL.
  // Both appear in the same bundle, so both bases have to be tried.
  const roots = base === '' ? ['', path.dirname(from)] : [base];
  const tried = [];
  for (const root of roots) {
    const key = path.relative(DIST, path.resolve(path.join(DIST, root), clean)).split(path.sep).join('/');
    tried.push(key);
    if (byExactPath.has(key)) { referenced.add(key); return; }
  }

  // Distinguish "missing" from "wrong case" — the latter is the silent itch killer.
  const lowered = tried.map(key => key.toLowerCase());
  const caseMatch = [...byExactPath.keys()].find(existing => lowered.includes(existing.toLowerCase()));
  if (caseMatch) errors.push(`${from}: references a file whose real name is "${caseMatch}" (itch's CDN is case-sensitive)`);
  else errors.push(`${from}: references "${tried[0]}" which does not exist in dist`);
}

for (const file of files) {
  const space = path.extname(file).toLowerCase();
  if (!TEXT.has(space)) continue;
  const source = fs.readFileSync(file, 'utf8');
  const from = rel(file);

  if (space === '.html') {
    for (const match of source.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) checkReference(from, match[1], path.dirname(from));
  }
  // Catch both quoted literals and template literals: BASE_URL is compiled to './'.
  for (const match of source.matchAll(/["'`](\.{0,2}\/[^"'`\s]+)["'`]/g)) {
    const ref = match[1];
    if (!ASSET.test(ref) || ref.includes('${')) continue;
    checkReference(from, ref, '');
  }
}

// --- asset case sanity -----------------------------------------------------------------
// Ship ids are lowercase in catalog.js, so any uppercase name under assets/ships is a
// mismatch waiting to happen on the CDN.
for (const key of byExactPath.keys()) {
  const base = path.basename(key);
  if (key.startsWith('assets/ships/') && base !== base.toLowerCase()) {
    errors.push(`assets/ships/${base} is not lowercase; the ids in catalog.js are, so this will 403 on itch`);
  }
}

const unreferenced = [...byExactPath.keys()].filter(
  key => !referenced.has(key) && !key.endsWith('index.html') && !/^(assets|audio)\//.test(key) && !key.includes('manifest.webmanifest')
);
for (const key of unreferenced) warnings.push(`${key} is in dist but nothing references it`);

// --- report ----------------------------------------------------------------------------
for (const warning of warnings) console.log(`warn:  ${warning}`);
for (const error of errors) console.error(`ERROR: ${error}`);

if (errors.length) {
  console.error(`\n${errors.length} problem(s) — do not upload this build.`);
  process.exit(1);
}
console.log(`\nOK — ${referenced.size} references resolved with exact case, structure within itch limits.`);
