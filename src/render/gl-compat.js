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

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Convert camelCase to kebab-case.
 * e.g. 'crossZoom' → 'cross-zoom', 'bowTieWithParameter' → 'bow-tie-with-parameter'
 *
 * @param {string} str
 * @returns {string}
 */
function camelToKebab(str) {
  return str.replace(/([A-Z])/g, '-$1').toLowerCase();
}

/**
 * Resolve user-supplied params against the param schema: fill in defaults
 * and resolve sampler2D texture paths to absolute paths.
 *
 * @param {Record<string,any>|undefined} userParams  User-provided param values
 * @param {Array<{name:string,type:string,default:any}>} paramSchema  Param definitions from registry
 * @param {Record<string,string>|undefined} texture  Texture overrides (e.g. { luma: '/path/to/foo.png' })
 * @param {string} projectDir  Project directory (for resolving relative paths)
 * @returns {Record<string,any>}  Resolved param dict with all defaults filled and paths absolute
 */
function resolveParams(userParams, paramSchema, texture, projectDir) {
  const resolved = { ...(userParams || {}) };

  for (const def of paramSchema) {
    // Fill in defaults for missing params
    if (resolved[def.name] === undefined) {
      resolved[def.name] = def.default;
    }

    // Resolve sampler2D texture paths
    if (def.type === 'sampler2D') {
      let texPath = resolved[def.name];

      // Texture override via texture map (e.g. --texture luma:/path/to/foo.png)
      if (def.name === 'luma' && texture?.luma) {
        texPath = texture.luma;
      } else if (def.name === 'displacementMap' && texture?.displacementMap) {
        texPath = texture.displacementMap;
      }

      // Resolve __default_noise__ sentinel to the default noise texture
      if (!texPath || texPath === '__default_noise__') {
        texPath = path.resolve(projectDir, 'vendor/gl-transitions', 'textures', 'default-noise.png');
      }

      // Resolve relative paths to absolute
      if (texPath && typeof texPath === 'string' && !path.isAbsolute(texPath)) {
        texPath = path.resolve(projectDir, texPath);
      }

      resolved[def.name] = texPath;
    }
  }

  return resolved;
}

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
 * @param {object}  [opts._caps]     Override detected capabilities (for testing only)
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
  _caps,
}) {
  const caps = _caps ?? await detectCapabilities(ffmpegBin);

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
    // Bug 1 fix: convert camelCase input to kebab-case for registry lookup
    const kebabName = camelToKebab(glName);
    const gl = GL_TRANSITIONS[kebabName];
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
    // Bug 2 fix: resolve params first so sampler2D paths are absolute
    const resolvedParams = resolveParams(params ?? {}, gl.params, texture, PROJECT_ROOT);
    const envStr = buildEnvString(resolvedParams, gl.params, PROJECT_ROOT, defaultNoise);
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
