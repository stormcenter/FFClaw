/**
 * Font alias resolution for ASS subtitle rendering.
 *
 * Maps friendly aliases (sans, serif, mono, sans-latin) to actual font names,
 * and resolves font file paths for FFmpeg's fontsdir parameter.
 *
 * @module ass/fonts
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, '../../..');
export const FONTS_DIR    = path.resolve(PROJECT_ROOT, 'assets/fonts');

/** Friendly name → actual ASS Fontname mapping */
export const FONT_ALIASES = {
  'sans':       'Noto Sans CJK SC',
  'serif':      'Noto Serif CJK SC',
  'mono':       'Noto Sans Mono CJK SC',
  'sans-latin': 'Roboto',
};

/** Default when text contains CJK characters */
export const DEFAULT_FONT_CJK   = 'sans';
/** Default when text is pure ASCII */
export const DEFAULT_FONT_LATIN = 'sans-latin';

/**
 * Resolve the ASS Fontname for a given text content.
 *
 * @param {string} text       The text content to display
 * @param {string} [userFont] User-specified font alias or full name (highest priority)
 * @returns {string}          Resolved font name for use in ASS Style
 */
export function resolveFont(text, userFont) {
  if (userFont) {
    return FONT_ALIASES[userFont] ?? userFont;
  }
  const isAsciiOnly = /^[\x00-\x7F]*$/.test(text);
  const alias = isAsciiOnly ? DEFAULT_FONT_LATIN : DEFAULT_FONT_CJK;
  return FONT_ALIASES[alias];
}

/**
 * Get the absolute file path for a named font file.
 *
 * @param {string} filename  e.g. 'NotoSansCJKsc-Regular.otf'
 * @returns {string}         Absolute path
 */
export function fontPath(filename) {
  return path.join(FONTS_DIR, filename);
}
