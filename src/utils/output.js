/**
 * Unified output helpers for FFClaw.
 *
 * Three modes (controlled by global CLI flags):
 *   normal  – human-friendly text to stdout, errors to stderr
 *   --json  – newline-delimited JSON objects to stdout
 *   --quiet – suppress all non-error output
 *
 * All command handlers receive `{ json, quiet }` from yargs and call these
 * helpers instead of writing to process.stdout/stderr directly.
 */

/** @typedef {{ json?: boolean, quiet?: boolean }} OutputOpts */

/**
 * Print a success / informational message.
 *
 * @param {string|object} msg  Human-readable string OR plain object (JSON mode).
 * @param {OutputOpts} opts
 */
export function print(msg, opts = {}) {
  if (opts.quiet) return;
  if (opts.json) {
    const payload = typeof msg === 'object' ? msg : { type: 'info', message: msg };
    process.stdout.write(JSON.stringify(payload) + '\n');
  } else {
    process.stdout.write(String(msg) + '\n');
  }
}

/**
 * Print a structured "ok" result (used after mutating operations).
 *
 * @param {object} data   Must include at least `{ op }`.
 * @param {OutputOpts} opts
 */
export function ok(data, opts = {}) {
  if (opts.quiet) return;
  if (opts.json) {
    process.stdout.write(JSON.stringify({ type: 'ok', ...data }) + '\n');
  } else {
    // Human mode: format key fields
    const parts = Object.entries(data)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join('  ');
    process.stdout.write(`✓ ${parts}\n`);
  }
}

/**
 * Print an error and exit with code 1.
 *
 * @param {string} code     Error code constant (e.g. 'ASSET_NOT_FOUND')
 * @param {string} message  Human-readable description
 * @param {OutputOpts} opts
 */
export function error(code, message, opts = {}) {
  if (opts.json) {
    process.stderr.write(JSON.stringify({ type: 'error', code, message }) + '\n');
  } else {
    process.stderr.write(`✗ [${code}] ${message}\n`);
  }
  process.exit(1);
}

/**
 * Print a progress event (used during export).
 *
 * @param {object} data   e.g. { percent, frame, totalFrames, eta }
 * @param {OutputOpts} opts
 */
export function progress(data, opts = {}) {
  if (opts.quiet) return;
  if (opts.json) {
    process.stdout.write(JSON.stringify({ type: 'progress', ...data }) + '\n');
  } else {
    const pct = Math.round(data.percent ?? 0);
    const bar = progressBar(pct);
    const eta = data.eta ? `  ETA ${data.eta}` : '';
    process.stdout.write(`\r${bar} ${pct}%${eta}   `);
  }
}

/**
 * Build a simple ASCII progress bar string.
 * @param {number} pct  0-100
 * @returns {string}
 */
function progressBar(pct) {
  const width = 24;
  const filled = Math.round((pct / 100) * width);
  const empty = width - filled;
  return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
}

/**
 * Known error codes — import and use these constants in command handlers.
 */
export const Errors = /** @type {const} */ ({
  PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND',
  PROJECT_ALREADY_EXISTS: 'PROJECT_ALREADY_EXISTS',
  INVALID_PROJECT: 'INVALID_PROJECT',
  ASSET_NOT_FOUND: 'ASSET_NOT_FOUND',
  ASSET_FILE_NOT_FOUND: 'ASSET_FILE_NOT_FOUND',
  CLIP_NOT_FOUND: 'CLIP_NOT_FOUND',
  INVALID_RANGE: 'INVALID_RANGE',
  INVALID_TYPE: 'INVALID_TYPE',
  UNSUPPORTED_FORMAT: 'UNSUPPORTED_FORMAT',
  FFPROBE_ERROR: 'FFPROBE_ERROR',
  RENDER_ERROR: 'RENDER_ERROR',
  TEMPLATE_NOT_FOUND: 'TEMPLATE_NOT_FOUND',
  MISSING_VARIABLE: 'MISSING_VARIABLE',
  TRANSITION_NOT_FOUND: 'TRANSITION_NOT_FOUND',
  FILTER_NOT_FOUND: 'FILTER_NOT_FOUND',
  QUEUE_EMPTY: 'QUEUE_EMPTY',
  QUEUE_JOB_NOT_FOUND: 'QUEUE_JOB_NOT_FOUND',
  JOB_NOT_FOUND: 'JOB_NOT_FOUND',
  JOB_IN_PROGRESS: 'JOB_IN_PROGRESS',
});
