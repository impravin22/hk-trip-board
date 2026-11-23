'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const SITE_DIR = join(__dirname, '..');
const BUILD_TOOL = join(SITE_DIR, 'tools', 'build-pages.mjs');
/** Everything a public web host needs, and nothing else: no tests, tools, notes or credit lists. */
const EXPECTED_TOP_LEVEL = ['base.css', 'images', 'index.html', 'site.css', 'tokens.css', 'trip-logic.js', 'trip.js'];
const PHOTOGRAPH_COUNT = 25;

/**
 * Builds the site for a plain web host into a fresh folder.
 * @returns {string} the folder the build wrote to
 */
function buildIntoTemporaryFolder() {
  const outDir = mkdtempSync(join(tmpdir(), 'trip-pages-'));
  execFileSync(process.execPath, [BUILD_TOOL, outDir]);
  return outDir;
}

test('the web-host build is a complete document that asks search engines to stay away', (context) => {
  const outDir = buildIntoTemporaryFolder();
  context.after(() => rmSync(outDir, { recursive: true, force: true }));

  const page = readFileSync(join(outDir, 'index.html'), 'utf8');
  const head = page.slice(0, page.indexOf('</head>'));
  const body = page.slice(page.indexOf('<body>'));

  assert.match(page, /^<!doctype html>\n<html lang="en-GB">\n<head>\n/);
  assert.match(head, /<meta charset="utf-8">/);
  assert.match(head, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
  assert.match(head, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(head, /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">/);
  assert.match(head, /<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>/);
  // The site has no icon of its own. An empty one stops every visit from asking the host for favicon.ico and getting a 404.
  assert.match(head, /<link rel="icon" href="data:,">/);
  assert.match(head, /<title>Hong Kong Trip Board<\/title>/);
  assert.match(head, /<link rel="stylesheet" href="site\.css">/);
  assert.equal(head.includes('claude:'), false, 'a tag meant for the Claude host is still in the head');
  assert.match(body, /<main id="main"/);
  assert.match(body, /<script src="trip-logic\.js"><\/script>\s*<script src="trip\.js"><\/script>/);
  assert.match(page, /<\/script>\n<\/body>\n<\/html>\n$/);
  assert.equal((page.match(/<title>/g) ?? []).length, 1);
  assert.equal(body.includes('<link '), false, 'a stylesheet link was left in the body');
});

test('the web-host build holds the page, its styles, scripts and photographs, and nothing else', (context) => {
  const outDir = buildIntoTemporaryFolder();
  context.after(() => rmSync(outDir, { recursive: true, force: true }));

  const images = readdirSync(join(outDir, 'images')).sort();

  assert.deepEqual(readdirSync(outDir).sort(), EXPECTED_TOP_LEVEL);
  assert.equal(images.length, PHOTOGRAPH_COUNT);
  assert.deepEqual(images.filter((name) => !name.endsWith('.jpg')), [], 'something that is not a photograph was copied');
  for (const name of images) {
    assert.equal(statSync(join(outDir, 'images', name)).size, statSync(join(SITE_DIR, 'images', name)).size, `${name} differs from its source`);
  }
});

test('every photograph the page shows is in the web-host build', (context) => {
  const outDir = buildIntoTemporaryFolder();
  context.after(() => rmSync(outDir, { recursive: true, force: true }));

  const page = readFileSync(join(outDir, 'index.html'), 'utf8');
  const shown = [...page.matchAll(/<img [^>]*src="images\/([^"]+)"/g)].map((match) => match[1]);

  assert.equal(shown.length, PHOTOGRAPH_COUNT);
  assert.deepEqual(shown.filter((name) => !readdirSync(join(outDir, 'images')).includes(name)), []);
});

test('the build refuses to write into the site folder itself', () => {
  assert.throws(() => execFileSync(process.execPath, [BUILD_TOOL, SITE_DIR], { stdio: 'pipe' }), /must not be the site folder/);
  assert.throws(() => execFileSync(process.execPath, [BUILD_TOOL, join(SITE_DIR, '..')], { stdio: 'pipe' }), /must not be the site folder/);
});
