/**
 * Export runner — wraps FFCreator.start() with progress reporting.
 *
 * Supports three output modes (matching the global CLI flags):
 *   normal  – progress bar printed to stdout via carriage return
 *   --json  – each progress tick emits a newline-delimited JSON object
 *   --quiet – all progress output suppressed
 *
 * @module render/export-runner
 */

import { progress as reportProgress } from '../utils/output.js';

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Start rendering and resolve when complete.
 *
 * @param {import('ffcreator').FFCreator} creator
 * @param {object}  [opts]
 * @param {boolean} [opts.json]   Emit newline-delimited JSON events
 * @param {boolean} [opts.watch]  Alias for !json; show progress bar
 * @param {boolean} [opts.quiet]  Suppress all output
 * @returns {Promise<string>}  Resolves with the absolute output file path.
 */
export async function run(creator, opts = {}) {
  return new Promise((resolve, reject) => {
    let startTime  = Date.now();
    let lastPct    = -1;

    // ── start event ──────────────────────────────────────────────────────────

    creator.on('start', () => {
      startTime = Date.now();
      if (opts.quiet) return;
      if (opts.json) {
        process.stdout.write(JSON.stringify({ type: 'start' }) + '\n');
      } else {
        process.stdout.write('Rendering…\n');
      }
    });

    // ── progress event ───────────────────────────────────────────────────────

    creator.on('progress', (e) => {
      // FFCreator emits e.percent as a 0–1 float
      const pct     = Math.round((e.percent ?? 0) * 100);
      if (pct === lastPct) return;   // debounce identical ticks
      lastPct = pct;

      const elapsed  = (Date.now() - startTime) / 1000;
      const eta      = pct > 0
        ? Math.round((elapsed / pct) * (100 - pct))
        : null;

      reportProgress(
        {
          percent:     pct,
          frame:       e.frame       ?? null,
          totalFrames: e.totalFrames ?? null,
          eta:         eta != null ? `${eta}s` : null,
        },
        opts,
      );
    });

    // ── complete event ───────────────────────────────────────────────────────

    creator.on('complete', (e) => {
      // Clean up the carriage-return progress line in human mode
      if (!opts.quiet && !opts.json) {
        process.stdout.write('\n');
      }

      // FFCreator puts the output path on the event or the conf
      const outputPath = e.output ?? creator.getConf?.('output') ?? '';

      if (opts.json) {
        process.stdout.write(
          JSON.stringify({ type: 'complete', output: outputPath }) + '\n',
        );
      }

      resolve(outputPath);
    });

    // ── error event ──────────────────────────────────────────────────────────

    creator.on('error', (e) => {
      // Clean up progress line before emitting the error
      if (!opts.quiet && !opts.json) {
        process.stdout.write('\n');
      }

      const raw  = e?.error ?? e;
      const msg  = raw instanceof Error ? raw.message : String(raw ?? 'Unknown render error');
      const err  = new Error(`Render failed: ${msg}`);
      err.code   = 'RENDER_ERROR';
      err.cause  = raw instanceof Error ? raw : undefined;
      reject(err);
    });

    // ── kick off the render ───────────────────────────────────────────────────

    try {
      creator.start();
    } catch (startErr) {
      startErr.code = startErr.code ?? 'RENDER_ERROR';
      reject(startErr);
    }
  });
}
