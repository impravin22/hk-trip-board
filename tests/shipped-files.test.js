'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

/** Every text file the published page is made of. */
const SHIPPED_FILES = ['index.html', 'site.css', 'tokens.css', 'base.css', 'trip.js', 'trip-logic.js'];

/**
 * The names the state switcher went by while it was shown at #preview for the owner's approval:
 * its markup hooks, its style rule and its script identifiers. Other uses of the word
 * (a link preview, a file called preview.html) are not matched.
 */
const PREVIEW_SWITCHER = /data-preview|class="preview"|\.preview\b|#preview|PREVIEW_(?:HASH|INSTANTS)|previewBar|applyPreviewState|initPreview|preview\.(?:nowMs|isStorageBlocked)/;

/**
 * @param {string} text the contents of one file
 * @param {RegExp} pattern what to look for
 * @returns {number[]} the one-based numbers of the lines that match
 */
function matchingLines(text, pattern) {
  return text.split('\n').flatMap((line, index) => (pattern.test(line) ? [index + 1] : []));
}

for (const fileName of SHIPPED_FILES) {
  test(`${fileName} carries no trace of the preview state switcher`, () => {
    const text = readFileSync(join(__dirname, '..', fileName), 'utf8');

    assert.deepEqual(matchingLines(text, PREVIEW_SWITCHER), [], `${fileName} still mentions it on these lines`);
  });
}
