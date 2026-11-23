// Builds the site for a plain web host such as GitHub Pages.
// index.html in this folder is a page fragment: the Claude artifact host wraps it in a document when it publishes.
// A plain host does no wrapping, so this writes a complete document and copies the files it needs beside it.
// Nothing else is copied: no tests, tools, notes or credit lists.
// Usage: node tools/build-pages.mjs <output folder>
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEXT_FILES = ['site.css', 'tokens.css', 'base.css', 'trip-logic.js', 'trip.js'];
const IMAGE_FOLDER = 'images';
/** Where the fragment's head tags end and the page itself starts. */
const BODY_START = '<a class="skip"';
/** Tags that only mean something to the Claude artifact host. */
const HOST_ONLY_TAG = /^<meta name="claude:[^>]*>$/;
/** The page names a hotel and travel dates, so it asks search engines not to list it. */
const HEAD_START = [
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  '<meta name="robots" content="noindex, nofollow">',
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  // The site has no icon of its own: an empty one stops browsers asking the host for favicon.ico.
  '<link rel="icon" href="data:,">',
];

const siteDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outArgument = process.argv[2];
if (!outArgument) {
  console.error('Usage: node tools/build-pages.mjs <output folder>');
  process.exit(2);
}
const outDir = resolve(outArgument);

/**
 * A folder's identity on disk. Two spellings of one folder give the same answer: another letter case
 * on a file system that ignores case, or a path that reaches it through a symlink.
 * @param {string} folder a folder that exists
 * @returns {string}
 */
function identityOf(folder) {
  const { dev, ino } = statSync(folder);
  return `${dev}:${ino}`;
}

/**
 * @param {string} folder
 * @returns {string[]} the identities of the folder and of every folder above it, leaving out any that do not exist yet
 */
function identitiesUpFrom(folder) {
  const chain = [folder];
  while (dirname(chain.at(-1)) !== chain.at(-1)) {
    chain.push(dirname(chain.at(-1)));
  }
  return chain.filter((path) => existsSync(path)).map(identityOf);
}

// Refused: the site folder, any folder inside it and any folder that holds it. Writing there would overwrite the
// page fragment with the built document, or scatter the build through the source. Paths are compared by what they
// are on disk, not by how they are spelt.
const isSiteOrInsideIt = identitiesUpFrom(outDir).includes(identityOf(siteDir));
const holdsSite = existsSync(outDir) && identitiesUpFrom(siteDir).includes(identityOf(outDir));
if (isSiteOrInsideIt || holdsSite) {
  console.error(`The output folder must not be the site folder, one inside it or one that holds it: ${outDir}`);
  process.exit(2);
}

const fragment = readFileSync(join(siteDir, 'index.html'), 'utf8');
const split = fragment.indexOf(BODY_START);
if (split === -1) {
  console.error('index.html has no skip link to mark where the page starts.');
  process.exit(1);
}
const headTags = fragment.slice(0, split).split('\n').map((line) => line.trim()).filter((line) => line !== '' && !HOST_ONLY_TAG.test(line));
const stray = headTags.filter((line) => !/^<(?:title|meta|link)\b/.test(line));
if (stray.length > 0) {
  console.error(`Unexpected content before the page starts: ${stray[0]}`);
  process.exit(1);
}
const body = fragment.slice(split).trimEnd();
const page = ['<!doctype html>', '<html lang="en-GB">', '<head>', ...HEAD_START, ...headTags, '</head>', '<body>', body, '</body>', '</html>', ''].join('\n');

mkdirSync(join(outDir, IMAGE_FOLDER), { recursive: true });
writeFileSync(join(outDir, 'index.html'), page);
for (const fileName of TEXT_FILES) {
  copyFileSync(join(siteDir, fileName), join(outDir, fileName));
}
const photographs = readdirSync(join(siteDir, IMAGE_FOLDER)).filter((fileName) => fileName.endsWith('.jpg'));
for (const fileName of photographs) {
  copyFileSync(join(siteDir, IMAGE_FOLDER, fileName), join(outDir, IMAGE_FOLDER, fileName));
}
console.log(`built ${outDir}: index.html, ${TEXT_FILES.length} style and script files, ${photographs.length} photographs`);
