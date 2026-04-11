/**
 * 'slide-up' animation — text slides in from below.
 *
 * ASS tags: \move(x, y+offset, x, y) + \fad
 *
 * @module ass/animations/slide-up
 */

/**
 * @param {object} ctx
 * @param {number} ctx.x
 * @param {number} ctx.y
 * @param {number} ctx.inDuration
 * @param {number} ctx.outDuration
 * @param {number} [ctx.params.offset]  Slide distance in pixels (default 80)
 * @returns {string}
 */
export function slideUp(ctx) {
  const {
    x, y,
    inDuration  = 0.4,
    outDuration = 0.4,
    params      = {},
  } = ctx;
  const offset = params.offset ?? 80;
  const i = Math.round(inDuration * 1000);
  const o = Math.round(outDuration * 1000);

  // Start below (larger Y), end at target Y
  const x1 = x;
  const y1 = y + offset;
  const x2 = x;
  const y2 = y;

  return `\\move(${x1},${y1},${x2},${y2})\\fad(${i},${o})`;
}

export const meta = {
  name: 'slide-up',
  description: '从下方滑入',
  params: {
    inDuration:  { type: 'number', default: 0.4, description: '淡入时长（秒）' },
    outDuration: { type: 'number', default: 0.4, description: '淡出时长（秒）' },
    offset:      { type: 'number', default: 80,  description: '滑动距离（像素）' },
  },
};
