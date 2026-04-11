/**
 * 'typewriter' animation — characters appear one by one.
 *
 * Generates multiple Dialogue lines, one per character, each starting
 * at start + n * charDelay milliseconds.
 *
 * @module ass/animations/typewriter
 */

import { toASSTime } from '../time.js';

export const meta = {
  name: 'typewriter',
  description: '逐字打字机',
  params: {
    charDelay: { type: 'number', default: 50, description: '每字符延迟（毫秒），默认 50ms/字符' },
  },
};

/**
 * Build typewriter Dialogue lines for a TextClip.
 *
 * @param {object} clip
 * @param {object} opts
 * @param {number} opts.width   PlayResX
 * @param {number} opts.height  PlayResY
 * @returns {string[]}  Array of Dialogue lines (including trailing '\n')
 */
export function buildTypewriterDialogues(clip, opts) {
  const {
    content        = '',
    start          = 0,
    duration       = 3,
    animationParams = {},
  } = clip;
  const charDelay   = animationParams.charDelay ?? 50;
  const end         = start + duration;
  const styleName   = 'Default';
  const charDelaySec = charDelay / 1000;

  const lines = [];
  const chars = [...content];

  for (let i = 0; i < chars.length; i++) {
    const charStart = start + i * charDelaySec;
    const visibleText = chars.slice(0, i + 1).join('');
    const line = [
      'Dialogue: 0',
      toASSTime(charStart),
      toASSTime(end),
      styleName,
      '',
      '0', '0', '0',
      '',
      visibleText,
    ].join(',');
    lines.push(line);
  }

  return lines;
}

/**
 * @param {object} ctx  AnimationContext
 * @returns {string}    Empty string (typewriter uses buildTypewriterDialogues separately)
 */
export function typewriter(ctx) {
  // Typewriter uses buildTypewriterDialogues which is called by the generator.
  // This function returns a tag for non-typewriter Dialogue lines (unused).
  return '';
}
