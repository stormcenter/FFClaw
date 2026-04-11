/**
 * Detect whether the system FFmpeg has libass / the ass/subtitles filter.
 *
 * @module ass/libass-check
 */

import { execSync } from 'node:child_process';

/**
 * Check if FFmpeg was built with libass (i.e. has ass / subtitles filter).
 *
 * @param {string} [ffmpegBin='ffmpeg']
 * @returns {boolean}
 */
export function checkLibass(ffmpegBin = 'ffmpeg') {
  try {
    const out = execSync(`${ffmpegBin} -filters 2>/dev/null`, { encoding: 'utf8' });
    return out.includes('subtitles') || out.includes('ass ');
  } catch {
    return false;
  }
}
