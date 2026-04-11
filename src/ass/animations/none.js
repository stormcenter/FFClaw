/**
 * 'none' animation — no extra ASS tags.
 *
 * @module ass/animations/none
 */

/**
 * Returns an empty string (no animation tags).
 * @param {object} _ctx  AnimationContext (ignored)
 * @returns {string}     ''
 */
export function none(_ctx) {
  return '';
}

export const meta = {
  name: 'none',
  description: '无动画（静态字幕）',
  params: {},
};
