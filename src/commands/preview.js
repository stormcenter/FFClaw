/**
 * `ffclaw preview` — render a preview of the project or a specific range.
 *
 * Produces a low-resolution preview MP4 suitable for quick review before the
 * final export.  Uses lower quality settings for speed.
 *
 * @module commands/preview
 */

import path from 'node:path';
import { load, save, resolveProjectDir } from '../core/project.js';
import { TimelineModel } from '../core/timeline-model.js';
import { build } from '../core/builder.js';
import { run } from '../render/export-runner.js';
import { print, ok, error, Errors, progress } from '../utils/output.js';

// ── Yargs command definition ──────────────────────────────────────────────────

export const command = 'preview';
export const desc    = 'Render a quick preview of the project';

export function builder(yargs) {
  return yargs
    .option('start', {
      type: 'number',
      description: 'Preview start time in seconds',
    })
    .option('duration', {
      alias: 'd',
      type: 'number',
      description: 'Preview duration in seconds (default: full timeline)',
    })
    .option('output', {
      alias: 'o',
      type: 'string',
      description: 'Preview output path (default: <project>/preview.mp4)',
    })
    .option('width', {
      type: 'number',
      description: 'Preview width in pixels (default: 640)',
      default: 640,
    })
    .option('crf', {
      type: 'number',
      description: 'CRF value for preview quality (default: 28, higher = smaller file)',
      default: 28,
    })
    .option('fps', {
      type: 'number',
      description: 'Preview frame rate (default: 24)',
      default: 24,
    })
    .option('open', {
      type: 'boolean',
      description: 'Open the preview file when done (macOS only)',
      default: false,
    })
    .example('$0 preview', 'Render a full-quality preview')
    .example('$0 preview --start 10 --duration 5', 'Preview from 10s, 5 seconds long')
    .example('$0 preview --output ./preview.mp4 --open', 'Save and open preview');
}

export default { command, desc, builder, handler: handlePreview };

// ── Handler ───────────────────────────────────────────────────────────────────

/**
 * @param {object} argv
 */
async function handlePreview(argv) {
  const opts     = { json: argv.json, quiet: argv.quiet };
  const dir      = resolveProjectDir(argv.project);
  const open     = argv.open && !opts.json;

  // ── Load project ───────────────────────────────────────────────────────────

  let projectData;
  try {
    projectData = await load(dir);
  } catch (err) {
    handleLoadError(err, dir, opts);
  }

  const model = new TimelineModel(projectData.timeline);
  const totalDuration = model.getDuration();

  if (totalDuration === 0) {
    error(Errors.INVALID_PROJECT, 'The timeline has no clips. Add clips before previewing.', opts);
  }

  // ── Determine range ────────────────────────────────────────────────────────

  const start    = argv.start    ?? 0;
  const duration = argv.duration ?? totalDuration - start;

  if (start >= totalDuration) {
    error(Errors.INVALID_RANGE, `Start time ${start}s is beyond timeline duration ${totalDuration}s`, opts);
  }

  // ── Build output path ──────────────────────────────────────────────────────

  const output = path.resolve(argv.output ?? path.join(dir, 'preview.mp4'));

  // ── Build FFCreator with preview settings ─────────────────────────────────

  // Temporarily adjust project dimensions for preview
  const previewWidth  = argv.width;
  const previewHeight = Math.round(previewWidth * (projectData.height / projectData.width));

  const previewProjectData = {
    ...projectData,
    width:  previewWidth,
    height: previewHeight,
    fps:    argv.fps,
  };

  let creator;
  try {
    creator = build(model, previewProjectData, dir, {
      output,
      crf:    argv.crf,
      preset: 'ultrafast',
      audioBitrate: '96k',
    });
  } catch (err) {
    const e = new Error(`Failed to build preview: ${err.message}`);
    e.code  = 'RENDER_ERROR';
    throw e;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  print(`Rendering preview (${previewWidth}×${previewHeight} @ ${argv.fps}fps, CRF ${argv.crf})…`, opts);

  let outputPath;
  try {
    outputPath = await run(creator, opts);
  } catch (err) {
    error(Errors.RENDER_ERROR, `Preview render failed: ${err.message}`, opts);
  }

  print(`Preview saved to: ${outputPath}`, opts);

  // ── Open (macOS) ───────────────────────────────────────────────────────────

  if (open) {
    const { exec } = await import('node:child_process');
    exec(`open "${outputPath}"`, (err) => {
      if (err) {
        // Non-fatal — just log
        process.stderr.write(`Warning: could not open preview: ${err.message}\n`);
      }
    });
  }

  ok({
    op:       'preview',
    output:   outputPath,
    duration,
    start,
    size:     `${previewWidth}×${previewHeight}`,
  }, opts);
}

// ── Shared error helpers ─────────────────────────────────────────────────────

/**
 * @param {Error} err
 * @param {string} dir
 * @param {{ json?: boolean, quiet?: boolean }} opts
 */
function handleLoadError(err, dir, opts) {
  if (err.code === 'PROJECT_NOT_FOUND') {
    error(Errors.PROJECT_NOT_FOUND, `No project found at ${dir}.  Run \`ffclaw new\` first.`, opts);
  }
  if (err.code === 'INVALID_PROJECT') {
    error(Errors.INVALID_PROJECT, err.message, opts);
  }
  throw err;
}
