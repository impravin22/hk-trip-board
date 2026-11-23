// Wraps index.html in the same document skeleton the artifact host adds at publish,
// so local checks render in standards mode exactly as the published page does.
// Writes one file per colour mode, because the host sets data-theme on the root element.
// Usage: node tools/build-preview.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST_RESET = [
  ':root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}',
  'body{margin:0;font:14px system-ui,sans-serif}',
  'img{max-width:100%}',
  '[hidden]{display:none!important}',
].join('');
const PREVIEWS = [
  { fileName: 'preview.html', theme: 'dark' },
  { fileName: 'preview-light.html', theme: 'light' },
];

const siteDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const page = readFileSync(join(siteDir, 'index.html'), 'utf8');

/**
 * @param {string} theme "light" or "dark", as the host would set it
 * @returns {string} a complete document
 */
function shell(theme) {
  return `<!doctype html><html lang="en-GB" data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${HOST_RESET}</style></head><body>${page}</body></html>\n`;
}

for (const { fileName, theme } of PREVIEWS) {
  writeFileSync(join(siteDir, fileName), shell(theme));
  console.log(`wrote ${fileName} (${theme})`);
}
