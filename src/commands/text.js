/**
 * `ffclaw text` — manage text overlays and subtitle clips.
 *
 * Sub-commands:
 *   text add     <content>           Add a text overlay clip
 *   text list                         List all text clips on the timeline
 *   text remove  <id>                Remove a text clip by ID
 *   text update  <id> <content>      Update text content on a clip
 *   text style   <id>                Apply styling to a text clip
 *
 * @module commands/text
 */

import { load, save, resolveProjectDir } from '../core/project.js';
import { TimelineModel } from '../core/timeline-model.js';
import { print, ok, error, Errors } from '../utils/output.js';
import { renderTimeline } from '../utils/table.js';

// ── Yargs command definition ──────────────────────────────────────────────────

export const command = 'text <subcommand>';
export const desc    = 'Manage text overlays and subtitles';

export function builder(yargs) {
  return yargs
    // ── text add ────────────────────────────────────────────────────────────
    .command({
      command: 'add <content>',
      desc: 'Add a text overlay or subtitle clip',
      builder: (y) =>
        y
          .positional('content', { type: 'string', description: 'Text content' })
          .option('start', {
            type: 'number',
            description: 'Timeline start time in seconds',
            default: 0,
          })
          .option('duration', {
            alias: 'd',
            type: 'number',
            description: 'Display duration in seconds',
            default: 3,
          })
          .option('font-size', {
            type: 'number',
            description: 'Font size in points',
          })
          .option('color', {
            type: 'string',
            description: 'Text colour (CSS hex, e.g. #ffffff)',
          })
          .option('background', {
            type: 'string',
            description: 'Background colour (CSS hex, e.g. #00000080)',
          })
          .option('font', {
            type: 'string',
            description: 'Font family name',
          })
          .option('align', {
            type: 'string',
            choices: ['left', 'center', 'right'],
            description: 'Text alignment',
            default: 'center',
          })
          .option('position', {
            type: 'string',
            description: 'Position preset (top / center / bottom)',
            default: 'bottom',
          })
          .option('animate-in', {
            type: 'string',
            description: 'Entry animation name',
          })
          .option('animate-out', {
            type: 'string',
            description: 'Exit animation name',
          })
          .option('animation', {
            type: 'string',
            description: 'Animation style (fade / slide-up / typewriter / karaoke / none)',
            default: 'fade',
          })
          .option('animate-in-duration', {
            type: 'number',
            description: 'In-animation duration in seconds',
            default: 0.4,
          })
          .option('animate-out-duration', {
            type: 'number',
            description: 'Out-animation duration in seconds',
            default: 0.4,
          })
          .option('outline', {
            type: 'number',
            description: 'Outline thickness in pixels (default 2)',
          })
          .option('shadow', {
            type: 'number',
            description: 'Shadow distance in pixels (default 1)',
          })
          .option('bold', {
            type: 'boolean',
            description: 'Bold text',
            default: false,
          })
          .option('italic', {
            type: 'boolean',
            description: 'Italic text',
            default: false,
          })
          .option('karaoke-words', {
            type: 'string',
            description: "Karaoke words JSON array, e.g. '[{\"w\":\"Hello\",\"ms\":500}]'",
          })
          .option('subtitle', {
            type: 'boolean',
            description: 'Treat as a subtitle clip (positioned at bottom)',
            default: false,
          })
          .example('$0 text add "Hello, World!" --start 2 --duration 4', 'Add text overlay at 2s')
          .example('$0 text add "Subtitle here" --subtitle --start 5 --duration 2', 'Add subtitle')
          .example('$0 text add "Title" --font-size 72 --color #ffcc00', 'Large styled title'),
      handler: handleAdd,
    })
    // ── text list ─────────────────────────────────────────────────────────────
    .command({
      command: 'list',
      desc: 'List all text clips on the timeline',
      handler: handleList,
    })
    // ── text remove ──────────────────────────────────────────────────────────
    .command({
      command: 'remove <id>',
      desc: 'Remove a text clip by ID',
      builder: (y) =>
        y
          .positional('id', { type: 'string', description: 'Text clip ID (e.g. c1)' })
          .example('$0 text remove c1', 'Remove text clip c1'),
      handler: handleRemove,
    })
    // ── text update ──────────────────────────────────────────────────────────
    .command({
      command: 'update <id> <content>',
      desc: 'Update the text content of a clip',
      builder: (y) =>
        y
          .positional('id',      { type: 'string', description: 'Text clip ID' })
          .positional('content', { type: 'string', description: 'New text content' })
          .example('$0 text update c1 "New content"', 'Update text clip c1'),
      handler: handleUpdate,
    })
    // ── text style ───────────────────────────────────────────────────────────
    .command({
      command: 'style <id>',
      desc: 'Apply or update styling on a text clip',
      builder: (y) =>
        y
          .positional('id', { type: 'string', description: 'Text clip ID' })
          .option('font-size',   { type: 'number', description: 'Font size in points' })
          .option('color',       { type: 'string', description: 'Text colour (CSS hex)' })
          .option('background',  { type: 'string', description: 'Background colour (CSS hex)' })
          .option('font',        { type: 'string', description: 'Font family name' })
          .option('align', {
            type: 'string',
            choices: ['left', 'center', 'right'],
            description: 'Text alignment',
          })
          .option('position', {
            type: 'string',
            description: 'Position preset (top / center / bottom)',
          })
          .option('animate-in',  { type: 'string', description: 'Entry animation' })
          .option('animate-out', { type: 'string', description: 'Exit animation' })
          .example('$0 text style c1 --font-size 60 --color #ff0000', 'Resize and recolour'),
      handler: handleStyle,
    })
    // ── text animations ─────────────────────────────────────────────────────
    .command({
      command: 'animations',
      aliases: ['animation', 'anim'],
      desc: 'List all available text animation styles',
      builder: (y) =>
        y
          .option('json', {
            type: 'boolean',
            description: 'Output as JSON',
          })
          .example('$0 text animations', 'List all animation styles')
          .example('$0 text animations --json', 'JSON output'),
      handler: handleAnimations,
    })
    .demandCommand(1, 'Please specify a text sub-command.')
    .example('$0 text add "Hello!" --start 0', 'Add a simple text overlay')
    .example('$0 text list', 'Show all text clips');
}

export default { command, desc, builder, handler: () => {} };

// ── Sub-command handlers ──────────────────────────────────────────────────────

/** Handle `text add <content>` */
async function handleAdd(argv) {
  const opts    = { json: argv.json, quiet: argv.quiet };
  const dir     = resolveProjectDir(argv.project);
  const content = argv.content;

  let projectData;
  try {
    projectData = await load(dir);
  } catch (err) {
    handleLoadError(err, dir, opts);
  }

  const model = new TimelineModel(projectData.timeline);

  // Determine position preset
  const position = argv.position ?? (argv.subtitle ? 'bottom' : 'bottom');

  // Parse karaoke words if provided
  let karaokeWords = undefined;
  if (argv['karaoke-words']) {
    try {
      karaokeWords = JSON.parse(argv['karaoke-words']);
    } catch {
      error({ code: 'INVALID_ARG' }, '--karaoke-words must be valid JSON', opts);
      return;
    }
  }

  const { id } = model.addClip({
    type:     'text',
    start:    argv.start,
    duration: argv.duration,
    content,
    fontSize:    argv['font-size'],
    color:       argv.color,
    font:        argv.font,
    align:       argv.align,
    position:    position,
    animateIn:   argv['animate-in'],
    animateOut:  argv['animate-out'],
    animation:   argv.animation,
    animateInDuration:  argv['animate-in-duration'],
    animateOutDuration: argv['animate-out-duration'],
    outline:     argv.outline,
    shadow:      argv.shadow,
    bold:        argv.bold,
    italic:      argv.italic,
    karaokeWords,
  });

  projectData.timeline = model.toJSON();
  await save(dir, projectData);

  print(`Added text clip ${id} at ${argv.start}s (duration ${argv.duration}s)`, opts);
  ok({
    op:       'text-add',
    clipId:   id,
    content,
    start:    argv.start,
    duration: argv.duration,
  }, opts);
}

/** Handle `text list` */
async function handleList(argv) {
  const opts = { json: argv.json, quiet: argv.quiet };
  const dir  = resolveProjectDir(argv.project);

  let projectData;
  try {
    projectData = await load(dir);
  } catch (err) {
    handleLoadError(err, dir, opts);
  }

  const model = new TimelineModel(projectData.timeline);
  const textClips = model._data.text ?? [];

  if (opts.json) {
    for (const clip of textClips) {
      print({ type: 'text-clip', ...clip }, opts);
    }
    return;
  }

  if (textClips.length === 0) {
    print('No text clips on the timeline.  Use `ffclaw text add` to add one.', opts);
    return;
  }

  print('\n  TEXT CLIPS', opts);
  print('  ' + '─'.repeat(70), opts);
  print(`  ${'ID'.padEnd(6)}  ${'START'.padEnd(8)}  ${'DUR'.padEnd(6)}  ${'CONTENT'}`, opts);
  print('  ' + '─'.repeat(70), opts);

  for (const clip of textClips) {
    const content = (clip.content ?? '').replace(/\n/g, ' ');
    const start  = (clip.start ?? 0).toFixed(1);
    const dur    = (clip.duration ?? 0).toFixed(1);
    const style  = [
      clip.fontSize  ? `${clip.fontSize}pt`  : '',
      clip.color     ? clip.color             : '',
      clip.font      ? clip.font               : '',
    ].filter(Boolean).join(' · ');

    print(`  ${clip.id.padEnd(6)}  ${start.padEnd(8)}  ${dur.padEnd(6)}  ${content}`, opts);
    if (style) print(`            style: ${style}`, opts);
  }

  print('', opts);
  print(`  Total: ${textClips.length} text clip(s)`, opts);
}

/** Handle `text remove <id>` */
async function handleRemove(argv) {
  const opts   = { json: argv.json, quiet: argv.quiet };
  const dir    = resolveProjectDir(argv.project);
  const clipId = argv.id;

  let projectData;
  try {
    projectData = await load(dir);
  } catch (err) {
    handleLoadError(err, dir, opts);
  }

  const model = new TimelineModel(projectData.timeline);

  try {
    model.remove(clipId);
  } catch (err) {
    if (err.code === 'CLIP_NOT_FOUND') {
      error(Errors.CLIP_NOT_FOUND, err.message, opts);
    }
    throw err;
  }

  projectData.timeline = model.toJSON();
  await save(dir, projectData);

  print(`Removed text clip ${clipId}`, opts);
  ok({ op: 'text-remove', clipId }, opts);
}

/** Handle `text update <id> <content>` */
async function handleUpdate(argv) {
  const opts    = { json: argv.json, quiet: argv.quiet };
  const dir     = resolveProjectDir(argv.project);
  const clipId  = argv.id;
  const content = argv.content;

  let projectData;
  try {
    projectData = await load(dir);
  } catch (err) {
    handleLoadError(err, dir, opts);
  }

  const model = new TimelineModel(projectData.timeline);
  const clips = model._data.text;
  const idx   = clips.findIndex((c) => c.id === clipId);

  if (idx === -1) {
    error(Errors.CLIP_NOT_FOUND, `Text clip '${clipId}' not found`, opts);
    return;
  }

  clips[idx] = { ...clips[idx], content };

  projectData.timeline = model.toJSON();
  await save(dir, projectData);

  print(`Updated text clip ${clipId}`, opts);
  ok({ op: 'text-update', clipId, content }, opts);
}

/** Handle `text style <id>` */
async function handleStyle(argv) {
  const opts   = { json: argv.json, quiet: argv.quiet };
  const dir    = resolveProjectDir(argv.project);
  const clipId = argv.id;

  let projectData;
  try {
    projectData = await load(dir);
  } catch (err) {
    handleLoadError(err, dir, opts);
  }

  const model = new TimelineModel(projectData.timeline);
  const clips = model._data.text;
  const idx   = clips.findIndex((c) => c.id === clipId);

  if (idx === -1) {
    error(Errors.CLIP_NOT_FOUND, `Text clip '${clipId}' not found`, opts);
    return;
  }

  // Apply style updates (only provided options)
  const updates = {
    ...(argv['font-size']  != null && { fontSize:  argv['font-size'] }),
    ...(argv.color         != null && { color:     argv.color }),
    ...(argv.background    != null && { background: argv.background }),
    ...(argv.font          != null && { font:       argv.font }),
    ...(argv.align         != null && { align:      argv.align }),
    ...(argv.position      != null && { position:   argv.position }),
    ...(argv['animate-in'] != null && { animateIn:  argv['animate-in'] }),
    ...(argv['animate-out']!= null && { animateOut: argv['animate-out'] }),
  };

  clips[idx] = { ...clips[idx], ...updates };

  projectData.timeline = model.toJSON();
  await save(dir, projectData);

  print(`Styled text clip ${clipId}`, opts);
  ok({ op: 'text-style', clipId, ...updates }, opts);
}

/** Handle `text animations` */
async function handleAnimations(argv) {
  const opts = { json: argv.json, quiet: argv.quiet };

  const { listAnimations } = await import('../ass/animations/index.js');
  const animations = listAnimations();

  if (argv.json) {
    print(animations, opts);
    return;
  }

  const W = 60;
  print('\n  ANIMATION STYLES', opts);
  print('  ' + '─'.repeat(W), opts);
  print(`  ${'NAME'.padEnd(14)}  ${'DESCRIPTION'.padEnd(20)}  PARAMS`, opts);
  print('  ' + '─'.repeat(W), opts);

  for (const anim of animations) {
    const params = Object.keys(anim.params || {}).join(', ') || '-';
    print(`  ${anim.name.padEnd(14)}  ${(anim.description || '-').padEnd(20)}  ${params}`, opts);
  }

  print('  ' + '─'.repeat(W), opts);
  print(`  Total: ${animations.length} animation style(s)`, opts);
  print('', opts);
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
