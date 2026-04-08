/**
 * `ffclaw export` — render the project timeline to a video file.
 *
 * Sub-commands:
 *   export                     Render the full timeline
 *   export thumbnail           Extract a single frame as an image
 *
 * Options:
 *   --output <path>            Output file path (required)
 *   --quality <high|medium|low> Quality preset (sets crf + x264 preset)
 *   --crf <number>             CRF value override (0–51; lower = better)
 *   --preset <slow|medium|fast> x264 preset override
 *   --audio-bitrate <string>   Audio bitrate (e.g. 192k)
 *   --watch                    Show real-time progress bar
 *   --json                     Emit newline-delimited JSON events
 *
 * @module commands/export
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

import { load, resolveProjectDir } from '../core/project.js';
import { TimelineModel } from '../core/timeline-model.js';
import { renderWithFFmpeg } from '../render/ffmpeg-renderer.js';
import { print, ok, error, Errors } from '../utils/output.js';

const execFileAsync = promisify(execFile);

// ── Quality preset mappings ───────────────────────────────────────────────────

const QUALITY_PRESETS = {
  high:   { crf: 18, preset: 'slow' },
  medium: { crf: 23, preset: 'medium' },
  low:    { crf: 28, preset: 'fast' },
};

// ── Yargs command definition ──────────────────────────────────────────────────

export const command = 'export [subcommand]';
export const desc    = 'Render the project timeline to a video file';

/** @param {import('yargs').Argv} yargs */
export function builder(yargs) {
  return yargs
    // ── export (default) ──────────────────────────────────────────────────────
    .command({
      command: '$0',
      desc: 'Render the full timeline to a video file',
      builder: (y) =>
        y
          .option('output', {
            alias: 'o',
            type: 'string',
            description: 'Output file path (required)',
            demandOption: true,
          })
          .option('quality', {
            type: 'string',
            choices: ['high', 'medium', 'low'],
            description: 'Quality preset: high (crf=18,slow), medium (crf=23,medium), low (crf=28,fast)',
          })
          .option('crf', {
            type: 'number',
            description: 'CRF value override (0–51; lower = better quality)',
          })
          .option('preset', {
            type: 'string',
            choices: ['slow', 'medium', 'fast'],
            description: 'x264 preset override',
          })
          .option('audio-bitrate', {
            type: 'string',
            description: 'Audio bitrate (e.g. 192k, 320k)',
          })
          .option('watch', {
            alias: 'w',
            type: 'boolean',
            description: 'Show real-time progress bar',
            default: false,
          })
          .example('$0 export --output out.mp4', 'Export with default settings')
          .example('$0 export --output out.mp4 --quality high', 'High-quality export')
          .example('$0 export --output out.mp4 --crf 20 --preset slow --watch', 'Custom quality with progress'),
      handler: handleExport,
    })
    // ── export thumbnail ──────────────────────────────────────────────────────
    .command({
      command: 'thumbnail',
      desc: 'Extract a single frame as a thumbnail image',
      builder: (y) =>
        y
          .option('time', {
            alias: 't',
            type: 'number',
            description: 'Time position in seconds to extract the frame',
            default: 0,
          })
          .option('output', {
            alias: 'o',
            type: 'string',
            description: 'Output image path (e.g. thumb.jpg, thumb.png)',
            demandOption: true,
          })
          .example('$0 export thumbnail --time 5 --output thumb.jpg', 'Extract frame at 5s')
          .example('$0 export thumbnail --output cover.png', 'Extract first frame'),
      handler: handleThumbnail,
    })
    .example('$0 export --output out.mp4 --quality high', 'High-quality render')
    .example('$0 export thumbnail --time 3 --output thumb.jpg', 'Extract thumbnail at 3s');
}

export default { command, desc, builder, handler: () => {} };

// ── Sub-command handlers ──────────────────────────────────────────────────────

/** Handle `export` (default render) */
async function handleExport(argv) {
  const opts = { json: argv.json, quiet: argv.quiet, watch: argv.watch };
  const dir  = resolveProjectDir(argv.project);

  const projectData = await loadProject(dir, opts);
  const model = new TimelineModel(projectData.timeline);

  // Resolve quality settings: explicit flags override quality preset
  const qualityDefaults = argv.quality ? QUALITY_PRESETS[argv.quality] : {};
  const crf          = argv.crf          ?? qualityDefaults.crf          ?? 23;
  const preset       = argv.preset       ?? qualityDefaults.preset       ?? 'fast';
  const audioBitrate = argv['audio-bitrate'] ?? '192k';
  const ffmpegBin    = argv.ffmpeg ?? 'ffmpeg';
  const output       = path.resolve(argv.output);

  const renderOpts = { output, crf, preset, audioBitrate, ffmpegBin };

  if (!opts.quiet && !opts.json) {
    print(`Exporting to ${output}  (crf=${crf} preset=${preset} audio=${audioBitrate})`, opts);
  }

  let outputPath;
  try {
    outputPath = await renderWithFFmpeg(model, projectData, dir, renderOpts, opts);
  } catch (err) {
    if (err.code === 'RENDER_ERROR') {
      error(Errors.RENDER_ERROR, err.message, opts);
    }
    throw err;
  }

  ok({ op: 'export', output: outputPath ?? output, crf, preset, audioBitrate }, opts);
}

/** Handle `export thumbnail` */
async function handleThumbnail(argv) {
  const opts = { json: argv.json, quiet: argv.quiet };
  const dir  = resolveProjectDir(argv.project);

  const projectData = await loadProject(dir, opts);
  const model = new TimelineModel(projectData.timeline);

  const time   = argv.time ?? 0;
  const output = path.resolve(argv.output);

  // Find the video clip that covers the requested time and extract the frame
  const timeline   = model.toJSON();
  const videoClips = [...(timeline.video ?? [])].sort((a, b) => (a.start ?? 0) - (b.start ?? 0));

  // Locate the clip that covers `time`, falling back to the first clip
  const clip = videoClips.find((c) => {
    const start = c.start ?? 0;
    const dur   = clipDuration(c);
    return time >= start && time < start + dur;
  }) ?? videoClips[0];

  if (!clip) {
    error(Errors.CLIP_NOT_FOUND, 'No video clips on the timeline — cannot extract a thumbnail.', opts);
  }

  const asset = projectData.assets?.[clip.asset];
  if (!asset) {
    error(Errors.ASSET_NOT_FOUND, `Asset '${clip.asset}' not found in project.`, opts);
  }

  const assetPath = path.isAbsolute(asset.path)
    ? asset.path
    : path.resolve(dir, asset.path);

  // Compute the source seek position: timeline time → source time
  const clipStart   = clip.start ?? 0;
  const clipIn      = clip.in    ?? 0;
  const speed       = clip.speed ?? 1;
  const seekSeconds = clipIn + (time - clipStart) * speed;

  if (!opts.quiet && !opts.json) {
    print(`Extracting thumbnail at ${time}s → ${output}`, opts);
  }

  try {
    await execFileAsync('ffmpeg', [
      '-ss', String(seekSeconds),
      '-i', assetPath,
      '-frames:v', '1',
      '-q:v', '2',
      '-y',
      output,
    ]);
  } catch (err) {
    error(Errors.RENDER_ERROR, `ffmpeg thumbnail extraction failed: ${err.message}`, opts);
  }

  ok({ op: 'thumbnail', output, time }, opts);
}

// ── Shared helpers ────────────────────────────────────────────────────────────

/**
 * Load the project, mapping load errors to user-friendly output.
 *
 * @param {string} dir
 * @param {{ json?: boolean, quiet?: boolean }} opts
 * @returns {Promise<import('../core/project.js').ProjectData>}
 */
async function loadProject(dir, opts) {
  try {
    return await load(dir);
  } catch (err) {
    if (err.code === 'PROJECT_NOT_FOUND') {
      error(Errors.PROJECT_NOT_FOUND, `No project found at ${dir}.  Run \`ffclaw new\` first.`, opts);
    }
    if (err.code === 'INVALID_PROJECT') {
      error(Errors.INVALID_PROJECT, err.message, opts);
    }
    throw err;
  }
}

/**
 * Compute a clip's rendered duration on the timeline.
 *
 * @param {object} clip
 * @returns {number}
 */
function clipDuration(clip) {
  if (clip.duration != null) return clip.duration;
  if (clip.out != null && clip.in != null) return (clip.out - clip.in) / (clip.speed ?? 1);
  if (clip.out != null) return clip.out / (clip.speed ?? 1);
  return 0;
}
