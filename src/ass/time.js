/**
 * ASS time format utilities.
 *
 * ASS uses h:mm:ss.cc (centiseconds = 1/100 second).
 *
 * @module ass/time
 */

/**
 * Convert a decimal number of seconds to an ASS timecode string.
 *
 * @param {number} seconds  Decimal seconds
 * @returns {string}        ASS timecode, e.g. '0:01:30.45'
 */
export function toASSTime(seconds) {
  const h  = Math.floor(seconds / 3600);
  const m  = Math.floor((seconds % 3600) / 60);
  const s  = Math.floor(seconds % 60);
  const cs = Math.round((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/**
 * Parse an ASS timecode string back to seconds.
 *
 * @param {string} timecode  e.g. '0:01:30.45'
 * @returns {number}         Decimal seconds
 */
export function fromASSTime(timecode) {
  const parts = timecode.split(':');
  if (parts.length !== 3) return 0;
  const [h, m, secCs] = parts;
  const [s, cs = '0'] = secCs.split('.');
  return parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseInt(s, 10) + parseInt(cs, 10) / 100;
}
