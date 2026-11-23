'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { contrastRatio, readTokenBlock, resolveToken } = require('./helpers/colour.js');

const TWO_DECIMALS = 100;
const round = (ratio) => Math.round(ratio * TWO_DECIMALS) / TWO_DECIMALS;

test('contrastRatio gives 21:1 for black on white', () => {
  assert.equal(round(contrastRatio('#000000', '#FFFFFF')), 21);
});

test('contrastRatio gives 4.54:1 for the tertiary grey on white', () => {
  assert.equal(round(contrastRatio('#767676', '#FFFFFF')), 4.54);
});

test('contrastRatio gives the same answer whichever colour comes first', () => {
  assert.equal(contrastRatio('#004DA5', '#FFFFFF'), contrastRatio('#FFFFFF', '#004DA5'));
});

test('contrastRatio reads lower-case hex the same as upper-case', () => {
  assert.equal(contrastRatio('#2a2a2a', '#ffffff'), contrastRatio('#2A2A2A', '#FFFFFF'));
});

test('contrastRatio refuses a colour that is not six-digit hex', () => {
  assert.throws(() => contrastRatio('oklch(51% 0.22 264)', '#FFFFFF'), /not a six-digit hex colour/);
  assert.throws(() => contrastRatio('#FFF', '#000000'), /not a six-digit hex colour/);
  assert.throws(() => contrastRatio(undefined, '#000000'), /not a six-digit hex colour/);
});

test('readTokenBlock reads the declarations of the rule and returns null when the rule is missing', () => {
  const css = ':root {\n  --color-bg: #FFFFFF; --color-text: #2A2A2A;\n}\n';

  assert.deepEqual(readTokenBlock(css, ':root'), { 'color-bg': '#FFFFFF', 'color-text': '#2A2A2A' });
  assert.equal(readTokenBlock(css, ':root[data-theme="dark"]'), null);
});

test('resolveToken follows a var() reference and reports a missing token', () => {
  const tokens = { 'color-action': '#004DA5', 'color-focus': 'var(--color-action)' };

  assert.equal(resolveToken(tokens, 'color-focus'), '#004DA5');
  assert.throws(() => resolveToken(tokens, 'color-missing'), /token --color-missing is missing/);
});
