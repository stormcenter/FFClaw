/**
 * 'fade' animation — fade-in / fade-out.
 *
 * ASS tag: \fad(inMs,outMs)
 *
 * @module ass/animations/fade
 */

/**
 * @param {object} ctx
 * @param {number} ctx.inDuration   Fade-in duration in seconds
 * @param {number} ctx.outDuration  Fade-out duration in seconds
 * @returns {string}  ASS override tag (without outer {})
 */
export function fade({ inDuration = 0.4, outDuration = 0.4 }) {
  const i = Math.round(inDuration * 1000);
  const o = Math.round(outDuration * 1000);
  return `\\fad(${i},${o})`;
}

export const meta = {
  name: 'fade',
  description: '淡入淡出',
  params: {
    inDuration:  { type: 'number', default: 0.4, description: '淡入时长（秒）' },
    outDuration: { type: 'number', default: 0.4, description: '淡出时长（秒）' },
  },
};
