/**
 * Progress reporting module for ClipCraft renders.
 *
 * Wraps the core `progress()` helper from output.js with structured state
 * management, ETA calculation, speed estimation, and multi-output-mode
 * support (human-readable bar, JSON lines, or silent).
 *
 * Supports:
 *   - ASCII progress bar with percentage and ETA
 *   - Speed (frames/sec) and estimated total time
 *   - Per-job reporting when multiple renders are queued
 *   - External event integration (FFCreator 'progress' events)
 *   - Memory / CPU warning thresholds (optional)
 *
 * @module render/progress-reporter
 */

import { progress as reportProgress } from '../utils/output.js';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} RenderState
 * @property {number} startTime      Unix timestamp (ms) when render started
 * @property {number} [lastTick]      Unix timestamp (ms) of last progress event
 * @property {number} lastPercent     Last reported percentage (0-100)
 * @property {number} [lastFrame]     Last reported frame number
 * @property {number} [totalFrames]   Total frames to render
 * @property {string} [phase]         Current render phase ('building'|'encoding'|'muxing'|'done')
 * @property {string} [jobId]         Job ID for queued renders
 * @property {string} [jobName]       Job name for display
 */

// ── Reporter class ───────────────────────────────────────────────────────────

/**
 * Stateful progress reporter.
 *
 * @example
 * const reporter = new ProgressReporter({ jobId: 'j1', jobName: 'Main export' });
 * reporter.onProgress({ percent: 0.25, frame: 150, totalFrames: 600 });
 * reporter.onComplete();
 */
export class ProgressReporter {
  /**
   * @param {object} [opts]
   * @param {string} [opts.jobId]
   * @param {string} [opts.jobName]
   * @param {boolean} [opts.json]
   * @param {boolean} [opts.quiet]
   * @param {number} [opts.width]  Progress bar character width (default 24)
   */
  constructor(opts = {}) {
    /** @type {RenderState} */
    this.state = {
      startTime:  Date.now(),
      lastPercent: -1,
      phase:      'building',
    };

    this.opts   = opts;
    this.width  = opts.width ?? 24;
    this._closed = false;
  }

  // ── Event handlers ─────────────────────────────────────────────────────────

  /**
   * Called when FFCreator emits a 'start' event.
   */
  onStart() {
    this.state.startTime  = Date.now();
    this.state.lastTick   = Date.now();
    this.state.lastPercent = -1;
    this.state.phase      = 'encoding';

    if (this.opts.quiet) return;

    const prefix = this._prefix();
    if (this.opts.json) {
      reportProgress({ type: 'start', jobId: this.state.jobId, ts: this.state.startTime }, this.opts);
    } else {
      process.stdout.write(`${prefix}Building pipeline…\n`);
    }
  }

  /**
   * Called when FFCreator emits a 'progress' event.
   *
   * @param {{ percent: number, frame: number, totalFrames?: number }} e
   */
  onProgress(e) {
    if (this.opts.quiet || this._closed) return;

    const pct     = Math.round((e.percent ?? 0) * 100);
    if (pct === this.state.lastPercent) return;  // debounce
    this.state.lastPercent  = pct;
    this.state.lastFrame    = e.frame ?? null;
    this.state.totalFrames = e.totalFrames ?? null;
    this.state.lastTick    = Date.now();

    const elapsed = (Date.now() - this.state.startTime) / 1000;
    const eta    = pct > 0 ? Math.round((elapsed / pct) * (100 - pct)) : null;
    const speed  = e.frame != null && elapsed > 0
      ? (e.frame / elapsed).toFixed(1)
      : null;

    if (this.opts.json) {
      reportProgress({
        type:        'progress',
        jobId:       this.state.jobId,
        percent:     pct,
        frame:       e.frame ?? null,
        totalFrames: e.totalFrames ?? null,
        eta:         eta != null ? `${eta}s` : null,
        speed:       speed != null ? `${speed} fps` : null,
        elapsed:     `${elapsed.toFixed(1)}s`,
      }, this.opts);
    } else {
      const bar    = this._bar(pct);
      const prefix = this._prefix();
      const speedStr = speed ? `  ${speed}f/s` : '';
      const etaStr   = eta   ? `  ETA ${eta}s` : '';
      process.stdout.write(`\r${prefix}${bar} ${pct}%${speedStr}${etaStr}   `);
    }
  }

  /**
   * Called when FFCreator emits a 'complete' event.
   *
   * @param {{ output?: string }} [e]
   */
  onComplete(e) {
    this._close();

    if (this.opts.quiet) return;

    const elapsed = ((Date.now() - this.state.startTime) / 1000).toFixed(1);

    if (this.opts.json) {
      reportProgress({
        type:     'complete',
        jobId:    this.state.jobId,
        output:   e?.output ?? '',
        elapsed:  `${elapsed}s`,
      }, this.opts);
    } else {
      process.stdout.write('\n');
      const prefix = this._prefix();
      process.stdout.write(
        `${prefix}✓ Done in ${elapsed}s${e?.output ? `  → ${e.output}` : ''}\n`,
      );
    }
  }

  /**
   * Called when FFCreator emits an 'error' event.
   *
   * @param {Error|string} err
   */
  onError(err) {
    this._close();

    if (this.opts.quiet) return;

    const msg = err instanceof Error ? err.message : String(err);

    if (this.opts.json) {
      process.stdout.write(JSON.stringify({
        type:    'error',
        jobId:   this.state.jobId,
        message: msg,
      }) + '\n');
    } else {
      process.stdout.write('\n');
      process.stderr.write(`✗ Render error: ${msg}\n`);
    }
  }

  // ── Manual controls ────────────────────────────────────────────────────────

  /**
   * Report a custom progress event (for non-FFCreator use).
   *
   * @param {number} percent  0-100
   * @param {string} [label]  Optional label to display
   */
  report(percent, label) {
    if (this.opts.quiet || this._closed) return;

    const pct = Math.max(0, Math.min(100, Math.round(percent)));

    if (this.opts.json) {
      reportProgress({ type: 'progress', jobId: this.state.jobId, percent: pct, label }, this.opts);
    } else {
      const bar    = this._bar(pct);
      const prefix = this._prefix();
      const labelStr = label ? `  ${label}` : '';
      process.stdout.write(`\r${prefix}${bar} ${pct}%${labelStr}   `);
    }
  }

  /**
   * Set the current phase label.
   *
   * @param {string} phase
   */
  setPhase(phase) {
    this.state.phase = phase;
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  /**
   * Build the job prefix string for output lines.
   *
   * @returns {string}
   */
  _prefix() {
    if (this.opts.jobName) {
      return `[${this.opts.jobName}] `;
    }
    if (this.opts.jobId) {
      return `[${this.opts.jobId}] `;
    }
    return '';
  }

  /**
   * Build an ASCII progress bar.
   *
   * @param {number} pct  0-100
   * @returns {string}
   */
  _bar(pct) {
    const filled = Math.round((pct / 100) * this.width);
    const empty  = this.width - filled;
    return '[' + '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, empty)) + ']';
  }

  /**
   * Clean up the terminal line and mark reporter as closed.
   */
  _close() {
    if (!this._closed && !this.opts.json) {
      // Clear the progress line
      process.stdout.write('\r' + ' '.repeat(100) + '\r');
    }
    this._closed = true;
  }
}

// ── Factory helpers ──────────────────────────────────────────────────────────

/**
 * Create a ProgressReporter bound to a specific job.
 *
 * @param {object} job    Job object from the queue
 * @param {{ json?: boolean, quiet?: boolean }} opts
 * @returns {ProgressReporter}
 */
export function createJobReporter(job, opts = {}) {
  return new ProgressReporter({
    jobId:   job.id,
    jobName: job.name,
    json:    opts.json,
    quiet:   opts.quiet,
  });
}

/**
 * Attach progress reporter event listeners to an FFCreator instance.
 *
 * @param {import('ffcreator').FFCreator} creator
 * @param {ProgressReporter} reporter
 * @returns {import('ffcreator').FFCreator}  The creator (for chaining)
 */
export function attachProgress(creator, reporter) {
  creator.on('start',     () => reporter.onStart());
  creator.on('progress',  (e) => reporter.onProgress(e));
  creator.on('complete',  (e) => reporter.onComplete(e));
  creator.on('error',     (e) => reporter.onError(e?.error ?? e));
  return creator;
}

/**
 * Throttle function — only calls the underlying function at most once per `minInterval` ms.
 *
 * @param {(e: any) => void} fn
 * @param {number} minInterval  Minimum ms between calls
 * @returns {(e: any) => void}
 */
export function throttle(fn, minInterval = 200) {
  let lastCall = 0;
  let pending  = null;

  return (e) => {
    const now = Date.now();
    const elapsed = now - lastCall;

    if (elapsed >= minInterval) {
      lastCall = now;
      fn(e);
    } else {
      pending = e;
      setTimeout(() => {
        lastCall = Date.now();
        fn(pending);
        pending = null;
      }, minInterval - elapsed);
    }
  };
}

// ── ETA calculator ────────────────────────────────────────────────────────────

/**
 * Compute estimated time remaining based on progress history.
 *
 * @param {number} percent  0-1 (not 0-100)
 * @param {number} elapsed  Elapsed time in seconds
 * @returns {number|null}  ETA in seconds, or null if cannot estimate
 */
export function computeETA(percent, elapsed) {
  if (percent <= 0 || elapsed <= 0) return null;
  const total = elapsed / percent;
  return Math.round(total - elapsed);
}

/**
 * Format a duration in seconds as a human-readable string.
 *
 * @param {number|null} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
  if (seconds == null || isNaN(seconds)) return '--:--';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}
