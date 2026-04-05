/**
 * `ffclaw filter` — manage and preview video/audio filter presets.
 *
 * Sub-commands:
 *   filter list                      List available filters
 *   filter apply  <preset>          Apply a preset filter to a clip
 *   filter show   <expr>             Parse and display a filter expression
 *   filter create <name> <expr>      Save a named filter preset to the project
 *   filter remove <name>             Delete a saved preset
 *
 * @module commands/filter
 */

import { load, save, resolveProjectDir } from '../core/project.js';
import { parse, toFFmpegFilterString, listFilters, validate, isValid } from '../core/filter-dsl.js';
import { print, ok, error, Errors } from '../utils/output.js';

// ── Yargs command definition ──────────────────────────────────────────────────

export const command = 'filter <subcommand>';
export const desc    = 'Manage video/audio filter presets and expressions';

export function builder(yargs) {
  return yargs
    // ── filter list ──────────────────────────────────────────────────────────
    .command({
      command: 'list',
      desc: 'List all built-in filter names',
      handler: handleList,
    })
    // ── filter show ──────────────────────────────────────────────────────────
    .command({
      command: 'show <expr>',
      desc: 'Parse and display a filter expression',
      builder: (y) =>
        y
          .positional('expr', { type: 'string', description: 'Filter expression (e.g. brightness=1.2|contrast=1.1)' })
          .example('$0 filter show "brightness=1.2|unsharp"', 'Parse and display a filter expression'),
      handler: handleShow,
    })
    // ── filter apply ─────────────────────────────────────────────────────────
    .command({
      command: 'apply <clip-id> <expr>',
      desc: 'Apply a filter expression to a clip (updates the clip filter field)',
      builder: (y) =>
        y
          .positional('clip-id', { type: 'string', description: 'Clip ID (e.g. c1, v1)' })
          .positional('expr',    { type: 'string', description: 'Filter expression' })
          .option('preset', {
            alias: 'p',
            type: 'string',
            description: 'Named preset to apply instead of a raw expression',
          })
          .example('$0 filter apply c1 "brightness=1.2|unsharp"', 'Apply filter to clip c1')
          .example('$0 filter apply c1 --preset vintage', 'Apply named preset'),
      handler: handleApply,
    })
    // ── filter create ───────────────────────────────────────────────────────
    .command({
      command: 'create <name> <expr>',
      desc: 'Save a named filter preset to the project',
      builder: (y) =>
        y
          .positional('name', { type: 'string', description: 'Preset name (e.g. vintage, high-contrast)' })
          .positional('expr', { type: 'string', description: 'Filter expression' })
          .example('$0 filter create vintage "contrast=1.3|saturation=0.8|unsharp"', 'Save a preset')
          .example('$0 filter create denoise-fast "denoise=2"', 'Save a denoise preset'),
      handler: handleCreate,
    })
    // ── filter remove ────────────────────────────────────────────────────────
    .command({
      command: 'remove <name>',
      desc: 'Delete a saved filter preset',
      builder: (y) =>
        y
          .positional('name', { type: 'string', description: 'Preset name' })
          .example('$0 filter remove vintage', 'Delete the vintage preset'),
      handler: handleRemove,
    })
    .demandCommand(1, 'Please specify a filter sub-command.')
    .example('$0 filter list', 'Show all available filters')
    .example('$0 filter show "brightness=1.2|unsharp"', 'Parse a filter expression');
}

export default { command, desc, builder, handler: () => {} };

// ── Sub-command handlers ──────────────────────────────────────────────────────

/** Handle `filter list` */
async function handleList(argv) {
  const opts = { json: argv.json, quiet: argv.quiet };

  const filters = listFilters();

  if (opts.json) {
    for (const name of filters) {
      print({ type: 'filter', name }, opts);
    }
    return;
  }

  print('\n  AVAILABLE FILTERS', opts);
  print('  ' + '─'.repeat(60), opts);

  // Group by category for readability
  const categories = {
    'Colour / correction': ['brightness', 'contrast', 'saturation', 'gamma', 'hue', 'eq'],
    'Blur / sharpen':       ['unsharp', 'blur', 'sharpen', 'denoise', 'hqdn3d', 'boxblur', 'median'],
    'Style / effect':       ['flip', 'flop', 'rotate', 'invert', 'Vintage', 'Noir', 'grayscale', 'sepia', 'edgedetect', 'noise'],
    'Resize / geometry':    ['scale', 'crop', 'pad'],
    'Frame / time':         ['fps', 'slow', 'fast', 'reverse', 'setpts', 'atempo'],
    'Audio':               ['volume', 'amix', 'acompressor'],
  };

  for (const [category, names] of Object.entries(categories)) {
    print(`\n  ${category}`, opts);
    for (const name of names) {
      print(`    ${name}`, opts);
    }
  }

  print('\n', opts);
  print(`  Total: ${filters.length} filter(s)`, opts);
}

/** Handle `filter show <expr>` */
async function handleShow(argv) {
  const opts = { json: argv.json, quiet: argv.quiet };
  const expr = argv.expr;

  const result = parse(expr);
  const errors = validate(expr);

  if (errors.length > 0) {
    for (const err of errors) {
      error(Errors.INVALID_TYPE, err, opts);
    }
  }

  if (opts.json) {
    print({
      type:     'filter-show',
      input:    expr,
      filters:  result.filters,
      ffmpeg:   toFFmpegFilterString(result) ?? '',
    }, opts);
    return;
  }

  print(`\n  Filter expression: "${expr}"`, opts);
  print('  ' + '─'.repeat(60), opts);
  print(`  Parsed ${result.filters.length} filter(s):`, opts);

  for (const { name, params } of result.filters) {
    const paramStr = Object.keys(params).length > 0
      ? Object.entries(params).map(([k, v]) => `${k}=${v}`).join(', ')
      : '(flag)';
    print(`    ${name}  ${paramStr}`, opts);
  }

  const ffmpeg = toFFmpegFilterString(result);
  print('\n  FFmpeg filter graph:', opts);
  print(`    ${ffmpeg ?? '(none)'}`, opts);
  print('', opts);
}

/** Handle `filter apply <clip-id> <expr>` */
async function handleApply(argv) {
  const opts    = { json: argv.json, quiet: argv.quiet };
  const dir     = resolveProjectDir(argv.project);
  const expr    = argv.expr;
  const clipId  = argv.clipId;

  // Validate expression first
  const errors = validate(expr);
  if (errors.length > 0) {
    for (const err of errors) {
      error(Errors.INVALID_TYPE, err, opts);
    }
  }

  let projectData;
  try {
    projectData = await load(dir);
  } catch (err) {
    handleLoadError(err, dir, opts);
  }

  // Load into TimelineModel to apply the filter
  const { TimelineModel } = await import('../core/timeline-model.js');
  const model = new TimelineModel(projectData.timeline);

  // Find the clip
  const clip = model.getClip(clipId);
  if (!clip) {
    error(Errors.CLIP_NOT_FOUND, `Clip '${clipId}' not found`, opts);
  }

  // Store the raw expression as the filter field
  model._data.video = model._data.video.map((c) =>
    c.id === clipId ? { ...c, filter: expr } : c,
  );
  model._data.audio = model._data.audio.map((c) =>
    c.id === clipId ? { ...c, filter: expr } : c,
  );

  // Also compile and store the FFmpeg filter string
  const ffmpegStr = toFFmpegFilterString(expr);

  projectData.timeline = model.toJSON();
  await save(dir, projectData);

  print(`Applied filter to clip ${clipId}: "${expr}"`, opts);
  ok({
    op:     'filter-apply',
    clipId,
    expr,
    ffmpeg:  ffmpegStr ?? '',
  }, opts);
}

/** Handle `filter create <name> <expr>` */
async function handleCreate(argv) {
  const opts  = { json: argv.json, quiet: argv.quiet };
  const dir   = resolveProjectDir(argv.project);
  const name  = argv.name.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
  const expr  = argv.expr;

  // Validate expression
  const errors = validate(expr);
  if (errors.length > 0) {
    for (const err of errors) {
      error(Errors.INVALID_TYPE, err, opts);
    }
  }

  let projectData;
  try {
    projectData = await load(dir);
  } catch (err) {
    handleLoadError(err, dir, opts);
  }

  projectData.filters ??= {};
  projectData.filters[name] = {
    expr,
    ffmpeg: toFFmpegFilterString(expr) ?? '',
  };

  await save(dir, projectData);

  print(`Saved filter preset "${name}": "${expr}"`, opts);
  ok({ op: 'filter-create', name, expr }, opts);
}

/** Handle `filter remove <name>` */
async function handleRemove(argv) {
  const opts = { json: argv.json, quiet: argv.quiet };
  const dir  = resolveProjectDir(argv.project);
  const name = argv.name.toLowerCase();

  let projectData;
  try {
    projectData = await load(dir);
  } catch (err) {
    handleLoadError(err, dir, opts);
  }

  if (!projectData.filters?.[name]) {
    error(Errors.FILTER_NOT_FOUND, `Filter preset "${name}" not found`, opts);
  }

  delete projectData.filters[name];
  await save(dir, projectData);

  print(`Removed filter preset "${name}"`, opts);
  ok({ op: 'filter-remove', name }, opts);
}

// ── Shared helpers ────────────────────────────────────────────────────────────

/**
 * Map project load errors to user-friendly output.
 *
 * @param {Error} err
 * @param {string} dir
 * @param {{ json?: boolean, quiet?: boolean }} opts
 * @returns {never}
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
