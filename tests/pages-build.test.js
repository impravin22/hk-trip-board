'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const SITE_DIR = join(__dirname, '..');
const BUILD_TOOL = join(SITE_DIR, 'tools', 'build-pages.mjs');
/** Everything a public web host needs, and nothing else: no tests, tools, notes or credit lists. */
const EXPECTED_TOP_LEVEL = ['base.css', 'images', 'index.html', 'site.css', 'tokens.css', 'trip-logic.js', 'trip.js'];
const TEXT_FILES = ['site.css', 'tokens.css', 'base.css', 'trip-logic.js', 'trip.js'];
const PHOTOGRAPH_COUNT = 25;
const STAND_IN_PAGE = '<title>Stand-in</title>\n<link rel="stylesheet" href="site.css">\n\n<a class="skip" href="#main">Skip to content</a>\n<main id="main"></main>\n';

/**
 * Builds the real site for a plain web host into a fresh folder, removed again when the test ends.
 * @param {import('node:test').TestContext} context
 * @returns {string} the folder the build wrote to
 */
function buildIntoTemporaryFolder(context) {
  const outDir = mkdtempSync(join(tmpdir(), 'trip-pages-'));
  context.after(() => rmSync(outDir, { recursive: true, force: true }));
  execFileSync(process.execPath, [BUILD_TOOL, outDir]);
  return outDir;
}

/**
 * Copies the tool beside a stand-in site in a fresh folder. The tool works on the folder it sits in,
 * so a check that goes wrong here can only damage the copy, never the real page.
 * @param {import('node:test').TestContext} context
 * @returns {{ root: string, site: string, tool: string }}
 */
function makeStandInSite(context) {
  const root = mkdtempSync(join(tmpdir(), 'trip-stand-in-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const site = join(root, 'site');
  mkdirSync(join(site, 'tools'), { recursive: true });
  mkdirSync(join(site, 'images'));
  copyFileSync(BUILD_TOOL, join(site, 'tools', 'build-pages.mjs'));
  writeFileSync(join(site, 'index.html'), STAND_IN_PAGE);
  for (const fileName of TEXT_FILES) {
    writeFileSync(join(site, fileName), '');
  }
  writeFileSync(join(site, 'images', 'one.jpg'), 'stand-in');
  return { root, site, tool: join(site, 'tools', 'build-pages.mjs') };
}

test('the web-host build is a complete document that asks search engines to stay away', (context) => {
  const outDir = buildIntoTemporaryFolder(context);

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
  const outDir = buildIntoTemporaryFolder(context);

  const images = readdirSync(join(outDir, 'images')).sort();

  assert.deepEqual(readdirSync(outDir).sort(), EXPECTED_TOP_LEVEL);
  assert.equal(images.length, PHOTOGRAPH_COUNT);
  assert.deepEqual(images.filter((name) => !name.endsWith('.jpg')), [], 'something that is not a photograph was copied');
  for (const name of [...TEXT_FILES, ...images.map((image) => join('images', image))]) {
    assert.ok(readFileSync(join(outDir, name)).equals(readFileSync(join(SITE_DIR, name))), `${name} differs from its source`);
  }
});

test('every photograph the page shows is in the web-host build', (context) => {
  const outDir = buildIntoTemporaryFolder(context);

  const page = readFileSync(join(outDir, 'index.html'), 'utf8');
  const shown = [...page.matchAll(/<img [^>]*src="images\/([^"]+)"/g)].map((match) => match[1]);

  assert.equal(shown.length, PHOTOGRAPH_COUNT);
  assert.deepEqual(shown.filter((name) => !readdirSync(join(outDir, 'images')).includes(name)), []);
});

test('the build refuses an output folder that is the site folder, sits inside it or holds it, however it is spelt', (context) => {
  const { root, site, tool } = makeStandInSite(context);
  const link = join(root, 'link-to-site');
  symlinkSync(site, link);
  const refused = [site, root, join(site, 'images'), join(site, 'not-yet-there'), link, join(link, 'out')];
  // On a file system that ignores letter case, another spelling names the same folder.
  if (existsSync(join(root, 'SITE'))) {
    refused.push(join(root, 'SITE'));
  }

  for (const outDir of refused) {
    const run = spawnSync(process.execPath, [tool, outDir], { encoding: 'utf8' });

    assert.equal(run.status, 2, `${outDir} was accepted`);
    assert.match(run.stderr, /must not be the site folder/);
  }
  assert.equal(readFileSync(join(site, 'index.html'), 'utf8'), STAND_IN_PAGE, 'the page fragment was overwritten');
  assert.deepEqual(readdirSync(join(site, 'images')), ['one.jpg'], 'the build wrote into the site folder');
});

test('the build writes beside the site folder when asked to', (context) => {
  const { root, tool } = makeStandInSite(context);
  const outDir = join(root, 'out');

  execFileSync(process.execPath, [tool, outDir]);

  assert.match(readFileSync(join(outDir, 'index.html'), 'utf8'), /^<!doctype html>\n/);
  assert.deepEqual(readdirSync(join(outDir, 'images')), ['one.jpg']);
});

test('the build stops with its usage when no output folder is given', (context) => {
  const { tool } = makeStandInSite(context);

  const run = spawnSync(process.execPath, [tool], { encoding: 'utf8' });

  assert.equal(run.status, 2);
  assert.match(run.stderr, /Usage: node tools\/build-pages\.mjs/);
});

test('the build stops, and writes nothing, when the page has no skip link to mark where it starts', (context) => {
  const { root, site, tool } = makeStandInSite(context);
  writeFileSync(join(site, 'index.html'), '<title>No start</title>\n<main id="main"></main>\n');

  const run = spawnSync(process.execPath, [tool, join(root, 'out')], { encoding: 'utf8' });

  assert.equal(run.status, 1);
  assert.match(run.stderr, /no skip link/);
  assert.equal(existsSync(join(root, 'out')), false);
});

test('the build stops, and writes nothing, when something other than a head tag comes before the page', (context) => {
  const { root, site, tool } = makeStandInSite(context);
  writeFileSync(join(site, 'index.html'), `<title>Stray</title>\n<p>Not a head tag</p>\n${STAND_IN_PAGE}`);

  const run = spawnSync(process.execPath, [tool, join(root, 'out')], { encoding: 'utf8' });

  assert.equal(run.status, 1);
  assert.match(run.stderr, /Unexpected content before the page starts/);
  assert.equal(existsSync(join(root, 'out')), false);
});
