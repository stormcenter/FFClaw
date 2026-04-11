/**
 * Animation registry — all built-in animation styles.
 *
 * @module ass/animations
 */

import { fade,  meta as fadeMeta }        from './fade.js';
import { none, meta as noneMeta }         from './none.js';
import { slideUp, meta as slideUpMeta }   from './slide-up.js';
import {
  typewriter,
  meta as typewriterMeta,
  buildTypewriterDialogues,
} from './typewriter.js';
import {
  karaoke,
  meta as karaokeMeta,
  buildKaraokeDialogue,
} from './karaoke.js';

const registry = new Map();

/**
 * Register an animation function + meta.
 * @param {function} fn
 * @param {object} meta
 */
export function registerAnimation(fn, meta) {
  registry.set(meta.name, { fn, meta });
}

// ── Built-in animations ────────────────────────────────────────────────────────

registerAnimation(fade,       fadeMeta);
registerAnimation(none,       noneMeta);
registerAnimation(slideUp,    slideUpMeta);
registerAnimation(typewriter,  typewriterMeta);
registerAnimation(karaoke,     karaokeMeta);

/**
 * Get an animation by name.
 * @param {string} name
 * @returns {{ fn: function, meta: object } | undefined}
 */
export function getAnimation(name) {
  return registry.get(name ?? 'none');
}

/**
 * List all registered animation styles.
 * @returns {object[]}
 */
export function listAnimations() {
  return [...registry.values()].map(({ meta }) => meta);
}

// Re-export helpers for use by generator
export { buildTypewriterDialogues, buildKaraokeDialogue };
