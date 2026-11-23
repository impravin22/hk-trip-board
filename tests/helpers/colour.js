'use strict';

/**
 * Colour helpers for the contrast tests: six-digit hex colours to WCAG 2.1 relative
 * luminance and contrast ratio, plus reading custom properties out of a stylesheet.
 */

const HEX_PATTERN = /^#([0-9a-f]{6})$/i;
const DECLARATION_PATTERN = /--([a-z0-9-]+):\s*([^;]+);/g;
const VAR_PATTERN = /^var\(--([a-z0-9-]+)\)$/;
const MAX_VAR_DEPTH = 5;
const CHANNEL_MAX = 255;
const HEX_CHANNEL_STARTS = [0, 2, 4];

/** The constants of the WCAG 2.1 relative-luminance formula. */
const LINEAR_SEGMENT_LIMIT = 0.04045;
const LINEAR_SEGMENT_DIVISOR = 12.92;
const GAMMA_OFFSET = 0.055;
const GAMMA = 2.4;
const LUMINANCE_WEIGHTS = [0.2126, 0.7152, 0.0722];
const FLARE = 0.05;

/**
 * @param {number} channel an sRGB channel, 0 to 1
 * @returns {number} the same channel in linear light
 */
function toLinear(channel) {
  return channel <= LINEAR_SEGMENT_LIMIT
    ? channel / LINEAR_SEGMENT_DIVISOR
    : ((channel + GAMMA_OFFSET) / (1 + GAMMA_OFFSET)) ** GAMMA;
}

/**
 * @param {string} value a six-digit hex colour, for example "#2A2A2A"
 * @returns {number} WCAG relative luminance, 0 to 1
 */
function luminanceOf(value) {
  const match = HEX_PATTERN.exec(String(value).trim());
  if (!match) {
    throw new Error(`not a six-digit hex colour: ${value}`);
  }
  return HEX_CHANNEL_STARTS
    .map((start) => toLinear(parseInt(match[1].slice(start, start + 2), 16) / CHANNEL_MAX))
    .reduce((sum, channel, index) => sum + channel * LUMINANCE_WEIGHTS[index], 0);
}

/**
 * @param {string} foreground a six-digit hex colour
 * @param {string} background a six-digit hex colour
 * @returns {number} WCAG contrast ratio, 1 to 21
 */
function contrastRatio(foreground, background) {
  const first = luminanceOf(foreground);
  const second = luminanceOf(background);
  return (Math.max(first, second) + FLARE) / (Math.min(first, second) + FLARE);
}

/**
 * Reads the custom properties declared in the first rule that follows a selector.
 * @param {string} css
 * @param {string} selector
 * @returns {Record<string, string> | null} token name to raw value, or null when the rule is missing
 */
function readTokenBlock(css, selector) {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) {
    return null;
  }
  const end = css.indexOf('}', start);
  const body = css.slice(start + selector.length + 2, end);
  return Object.fromEntries([...body.matchAll(DECLARATION_PATTERN)].map((match) => [match[1], match[2].trim()]));
}

/**
 * Follows var() references until a literal value is reached.
 * @param {Record<string, string>} tokens
 * @param {string} name
 * @returns {string}
 */
function resolveToken(tokens, name) {
  let value = tokens[name];
  for (let depth = 0; depth < MAX_VAR_DEPTH && value !== undefined; depth += 1) {
    const reference = VAR_PATTERN.exec(value);
    if (!reference) {
      return value;
    }
    value = tokens[reference[1]];
  }
  throw new Error(`token --${name} is missing or refers to itself`);
}

module.exports = { contrastRatio, readTokenBlock, resolveToken };
