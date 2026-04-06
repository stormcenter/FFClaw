/**
 * FFmpeg GL-transition compatibility detection.
 *
 * Checks which transition backend is available:
 *   - 'gltransition'  custom-compiled FFmpeg filter (GLSL shaders, all 121 effects)
 *   - 'xfade'         standard FFmpeg built-in (58 effects, always available in FFmpeg 4+)
 *   - 'none'          ffmpeg not found at all
 *
 * Results are cached for the lifetime of the process.
 *
 * @module render/gl-compat
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEnvString } from '../transitions/params.js';
import { XFADE_MAP, toXfade } from '../transitions/xfade-map.js';
import { GL_TRANSITIONS } from '../transitions/registry.js';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, '../..');

// ── Cache ──────────────────────────────────────────────────────────────────

/** @type {{ gltransition: boolean, xfade: boolean } | null} */
let _cache = null;

/**
 * Probe FFmpeg filter availability once and cache.
 *
 * @param {string} [ffmpegBin='ffmpeg']
 * @returns {Promise<{ gltransition: boolean, xfade: boolean }>}
 */
export async function detectCapabilities(ffmpegBin = 'ffmpeg') {
  if (_cache) return _cache;

  let output = '';
  try {
    const res = await execFileAsync(ffmpegBin, ['-filters'], { timeout: 5000 });
    output = res.stdout + res.stderr;
  } catch (err) {
    // ffmpeg not found or timed out
    _cache = { gltransition: false, xfade: false };
    return _cache;
  }

  _cache = {
    gltransition: output.includes('gltransition'),
    xfade:        output.includes('xfade'),
  };
  return _cache;
}

/** Reset cache (for tests). */
export function resetCapabilityCache() {
  _cache = null;
}

// ── Filter resolver ────────────────────────────────────────────────────────

/**
 * Resolve a transition effect + params into an FFmpeg filter fragment.
 *
 * Returns the inner part of the xfade/gltransition option string — without
 * input/output pad labels.  The caller adds `[inA][inB]...[out]`.
 *
 * @param {object} opts
 * @param {string}  opts.effect      Effect name: 'fade', 'gl:cross-zoom', …
 * @param {number}  opts.duration    Transition duration in seconds
 * @param {number}  opts.offset      When transition starts in the output timeline (seconds)
 * @param {object}  [opts.params]    User-supplied GL transition params
 * @param {object}  [opts.texture]   sampler2D texture overrides
 * @param {string}  [opts.ffmpegBin] Path to ffmpeg binary
 * @returns {Promise<string>}  FFmpeg filter string, e.g.
 *   "xfade=transition=zoomin:duration=1:offset=4"
 *   "gltransition=duration=1:source=/abs/path.glsl:offset=4"
 */
export async function resolveTransitionFilter({
  effect,
  duration,
  offset,
  params,
  texture,
  ffmpegBin = 'ffmpeg',
}) {
  const caps = await detectCapabilities(ffmpegBin);

  // ── Built-in FFCreator / simple named transitions ──────────────────────
  if (!effect.startsWith('gl:')) {
    // Map legacy effect names to xfade names
    const LEGACY_TO_XFADE = {
      fade:         'fade',
      dissolve:     'dissolve',
      wipe:         'wipeleft',
      'wipe-left':  'wipeleft',
      'wipe-right': 'wiperight',
      'wipe-up':    'wipeup',
      'wipe-down':  'wipedown',
      slide:        'slideleft',
      'slide-left':  'slideleft',
      'slide-right': 'slideright',
      zoom:         'zoomin',
      blur:         'hblur',
    };
    const xfadeName = LEGACY_TO_XFADE[effect] ?? 'fade';
    if (caps.xfade) {
      return `xfade=transition=${xfadeName}:duration=${duration}:offset=${offset}`;
    }
    // No xfade (very old ffmpeg) — fall through to concat without transition
    return null;
  }

  // ── GL Transition (gl: prefix) ─────────────────────────────────────────
  const glName = effect.slice(3); // strip 'gl:'

  if (caps.gltransition) {
    const gl = GL_TRANSITIONS[glName];
    if (!gl) {
      throw Object.assign(
        new Error(`GL Transition '${glName}' not found in registry`),
        { code: 'TRANSITION_GLSL_NOT_FOUND' },
      );
    }
    const glslPath = path.resolve(
      PROJECT_ROOT, 'vendor/gl-transitions', 'transitions', gl.glslFile,
    );
    const defaultNoise = path.resolve(
      PROJECT_ROOT, 'vendor/gl-transitions', 'textures', 'default-noise.png',
    );
    const envStr = buildEnvString(params ?? {}, gl.params, PROJECT_ROOT, defaultNoise);
    const parts = [`duration=${duration}`, `source=${glslPath}`, `offset=${offset}`];
    if (envStr) parts.push(`env=${envStr}`);
    return `gltransition=${parts.join(':')}`;
  }

  // Fallback: use best-matching xfade transition
  if (caps.xfade) {
    const xfadeName = toXfade(glName);
    return `xfade=transition=${xfadeName}:duration=${duration}:offset=${offset}`;
  }

  // Nothing available
  return null;
}
