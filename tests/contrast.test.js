'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { contrastRatio, readTokenBlock, resolveToken } = require('./helpers/colour.js');

const TEXT_MINIMUM = 4.5;
const UI_MINIMUM = 3;
const LIGHT_SELECTOR = ':root';
const DARK_ATTRIBUTE_SELECTOR = ':root[data-theme="dark"]';
const DARK_MEDIA_SELECTOR = ':root:not([data-theme="light"])';

/**
 * Every foreground and background the page pairs, with the WCAG 2.1 AA floor for that use.
 * The third text tone is paired with the page background only: the stylesheet never sets it on the quiet fill.
 */
const PAIRS = [
  ['color-text', 'color-bg', TEXT_MINIMUM],
  ['color-text-2', 'color-bg', TEXT_MINIMUM],
  ['color-text-3', 'color-bg', TEXT_MINIMUM],
  ['color-text', 'color-surface', TEXT_MINIMUM],
  ['color-text-2', 'color-surface', TEXT_MINIMUM],
  ['color-bg', 'color-text', TEXT_MINIMUM],
  ['color-accent', 'color-bg', TEXT_MINIMUM],
  ['color-accent', 'color-surface', UI_MINIMUM],
  ['color-accent-hover', 'color-bg', TEXT_MINIMUM],
  ['color-accent-ink', 'color-accent', TEXT_MINIMUM],
  ['color-accent-ink', 'color-accent-hover', TEXT_MINIMUM],
  ['color-destructive', 'color-bg', TEXT_MINIMUM],
  ['color-text', 'color-border', TEXT_MINIMUM],
  ['color-control', 'color-bg', UI_MINIMUM],
  ['color-focus', 'color-bg', UI_MINIMUM],
  ['color-focus', 'color-surface', UI_MINIMUM],
];

const css = readFileSync(join(__dirname, '..', 'tokens.css'), 'utf8');
const lightTokens = readTokenBlock(css, LIGHT_SELECTOR);

test('tokens.css commits to the light theme: a light block and no dark block', () => {
  assert.notEqual(lightTokens, null, 'the :root block is missing');
  assert.equal(readTokenBlock(css, DARK_ATTRIBUTE_SELECTOR), null, 'a :root[data-theme="dark"] block is still present');
  assert.equal(readTokenBlock(css, DARK_MEDIA_SELECTOR), null, 'a prefers-color-scheme dark block is still present');
});

for (const [foreground, background, minimum] of PAIRS) {
  test(`--${foreground} on --${background} is at least ${minimum}:1`, (context) => {
    const tokens = lightTokens ?? {};

    const ratio = contrastRatio(resolveToken(tokens, foreground), resolveToken(tokens, background));

    context.diagnostic(`${ratio.toFixed(2)}:1`);
    assert.ok(ratio >= minimum, `${ratio.toFixed(2)}:1 is below ${minimum}:1`);
  });
}
