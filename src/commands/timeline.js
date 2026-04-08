/**
 * `ffclaw timeline` — manage the project timeline.
 *
 * Sub-commands:
 *   timeline add video   <asset>          Add a video clip
 *   timeline add audio   <asset>          Add an audio clip
 *   timeline add image   <asset>          Add an image clip
 *   timeline add text    <content>        Add a text overlay
 *   timeline show                         Display the timeline
 *   timeline trim        <id>             Trim a clip's in/out points
 *   timeline split       <id> <at>        Split a clip at a time position
 *   timeline move        <id> <start>     Move a clip to a new start time
 *   timeline remove      <id>             Remove a clip
 *   timeline add-transition <c1> <c2>     Add a transition between two clips
 *   timeline transitions                  List all transitions
 *   timeline speed       <id> <mult>      Set playback speed
 *   timeline volume      <id> <level>     Set volume (0..1)
 *   timeline mute        <id>             Mute a clip
 *   timeline fade        <id>             Set fade-in/out on an audio clip
 *
 * @module commands/timeline
 */

import { load, save, resolveProjectDir } from '../core/project.js';
import { TimelineModel } from '../core/timeline-model.js';
import { print, ok, error, Errors } from '../utils/output.js';
import { renderTimeline } from '../utils/table.js';

// ── Yargs command definition ──────────────────────────────────────────────────

export const command = 'timeline <subcommand>';
export const desc    = 'Manage the project timeline';

/** @param {import('yargs').Argv} yargs */
export function builder(yargs) {
  return yargs
    // ── timeline add ──────────────────────────────────────────────────────────
    .command({
      command: 'add <type>',
      desc: 'Add a clip to the timeline (video / audio / image / text)',
      builder: (y) =>
        y
          .positional('type', {
            type: 'string',
            choices: ['video', 'audio', 'image', 'text'],
            description: 'Clip type',
          })
          // Positional: asset ID or text content
          .option('asset', {
            alias: 'a',
            type: 'string',
            description: 'Asset ID to place on the timeline (e.g. v1, a2, i1)',
          })
          .option('content', {
            alias: 'c',
            type: 'string',
            description: 'Text content (for text clips)',
          })
          .option('start', {
            type: 'number',
            description: 'Timeline start time in seconds',
            default: 0,
          })
          .option('in', {
            type: 'number',
            description: 'Source in-point in seconds',
          })
          .option('out', {
            type: 'number',
            description: 'Source out-point in seconds',
          })
          .option('duration', {
            alias: 'd',
            type: 'number',
            description: 'Rendered duration in seconds',
          })
          .option('speed', {
            type: 'number',
            description: 'Playback speed multiplier (default 1)',
          })
          .option('volume', {
            type: 'number',
            description: 'Volume level 0..1',
          })
          .option('loop', {
            type: 'boolean',
            description: 'Loop the audio clip',
          })
          .option('fade-in', {
            type: 'number',
            description: 'Fade-in duration in seconds (audio only)',
          })
          .option('fade-out', {
            type: 'number',
            description: 'Fade-out duration in seconds (audio only)',
          })
          .option('filter', {
            type: 'string',
            description: 'Filter preset name (video / image clips)',
          })
          .option('animate-in', {
            type: 'string',
            description: 'Entry animation name',
          })
          .option('animate-out', {
            type: 'string',
            description: 'Exit animation name',
          })
          .option('font-size', {
            type: 'number',
            description: 'Font size in points (text clips)',
          })
          .option('color', {
            type: 'string',
            description: 'Text colour (CSS hex, e.g. #ffffff)',
          })
          .option('font', {
            type: 'string',
            description: 'Font family name (text clips)',
          })
          .option('align', {
            type: 'string',
            choices: ['left', 'center', 'right'],
            description: 'Text alignment',
          })
          .example('$0 timeline add video --asset v1 --start 0 --in 0 --out 10', 'Add video clip')
          .example('$0 timeline add audio --asset a1 --start 0 --loop', 'Add looping audio')
          .example('$0 timeline add text --content "Hello" --start 2 --duration 3', 'Add text overlay'),
      handler: handleAdd,
    })
    // ── timeline show ─────────────────────────────────────────────────────────
    .command({
      command: 'show',
      desc: 'Display the timeline as an ASCII table',
      handler: handleShow,
    })
    // ── timeline trim ─────────────────────────────────────────────────────────
    .command({
      command: 'trim <id>',
      desc: "Trim a clip's in/out points",
      builder: (y) =>
        y
          .positional('id', { type: 'string', description: 'Clip ID (e.g. c1)' })
          .option('in', { type: 'number', description: 'New in-point in seconds' })
          .option('out', { type: 'number', description: 'New out-point in seconds' })
          .example('$0 timeline trim c1 --in 2 --out 8', 'Trim clip c1 to 2s–8s'),
      handler: handleTrim,
    })
    // ── timeline split ────────────────────────────────────────────────────────
    .command({
      command: 'split <id> <at>',
      desc: 'Split a clip at a timeline position',
      builder: (y) =>
        y
          .positional('id', { type: 'string', description: 'Clip ID' })
          .positional('at', { type: 'number', description: 'Timeline time in seconds to split at' })
          .example('$0 timeline split c1 5', 'Split clip c1 at 5s'),
      handler: handleSplit,
    })
    // ── timeline move ─────────────────────────────────────────────────────────
    .command({
      command: 'move <id> <start>',
      desc: 'Move a clip to a new timeline start position',
      builder: (y) =>
        y
          .positional('id', { type: 'string', description: 'Clip ID' })
          .positional('start', { type: 'number', description: 'New start time in seconds' })
          .example('$0 timeline move c1 10', 'Move clip c1 to start at 10s'),
      handler: handleMove,
    })
    // ── timeline remove ───────────────────────────────────────────────────────
    .command({
      command: 'remove <id>',
      desc: 'Remove a clip from the timeline',
      builder: (y) =>
        y
          .positional('id', { type: 'string', description: 'Clip ID' })
          .example('$0 timeline remove c1', 'Remove clip c1'),
      handler: handleRemove,
    })
    // ── timeline add-transition ───────────────────────────────────────────────
    .command({
      command: 'add-transition <clip1> <clip2>',
      desc: 'Add a transition between two adjacent clips',
      builder: (y) =>
        y
          .positional('clip1', { type: 'string', description: 'First clip ID' })
          .positional('clip2', { type: 'string', description: 'Second clip ID' })
          .option('effect', {
            alias: 'e',
            type: 'string',
            description: 'Transition effect (e.g. fade, wipe, gl:cross-zoom)',
            default: 'fade',
          })
          .option('duration', {
            alias: 'd',
            type: 'number',
            description: 'Transition duration in seconds',
            default: 0.5,
          })
          .option('params', {
            type: 'string',
            description: 'GL Transition params as key=value,key=value (e.g. strength=0.8,amplitude=2.0)',
          })
          .example('$0 timeline add-transition c1 c2 --effect wipe --duration 1', 'Add wipe transition')
          .example('$0 timeline add-transition c1 c2 --effect gl:cross-zoom --params strength=0.8', 'Add GL transition with params'),
      handler: handleAddTransition,
    })
    // ── timeline transitions ──────────────────────────────────────────────────
    .command({
      command: 'transitions',
      desc: 'List all transitions',
      handler: handleTransitions,
    })
    // ── timeline speed ────────────────────────────────────────────────────────
    .command({
      command: 'speed <id> <mult>',
      desc: 'Set playback speed for a clip',
      builder: (y) =>
        y
          .positional('id', { type: 'string', description: 'Clip ID' })
          .positional('mult', { type: 'number', description: 'Speed multiplier (e.g. 2 = 2× speed)' })
          .example('$0 timeline speed c1 2', 'Double the speed of clip c1'),
      handler: handleSpeed,
    })
    // ── timeline volume ───────────────────────────────────────────────────────
    .command({
      command: 'volume <id> <level>',
      desc: 'Set volume for a clip (0..1)',
      builder: (y) =>
        y
          .positional('id', { type: 'string', description: 'Clip ID' })
          .positional('level', { type: 'number', description: 'Volume level 0..1' })
          .example('$0 timeline volume c1 0.5', 'Set clip c1 volume to 50%'),
      handler: handleVolume,
    })
    // ── timeline mute ─────────────────────────────────────────────────────────
    .command({
      command: 'mute <id>',
      desc: 'Mute (or unmute) a clip',
      builder: (y) =>
        y
          .positional('id', { type: 'string', description: 'Clip ID' })
          .option('unmute', {
            type: 'boolean',
            description: 'Unmute the clip instead',
            default: false,
          })
          .example('$0 timeline mute c1', 'Mute clip c1')
          .example('$0 timeline mute c1 --unmute', 'Unmute clip c1'),
      handler: handleMute,
    })
    // ── timeline fade ─────────────────────────────────────────────────────────
    .command({
      command: 'fade <id>',
      desc: 'Set fade-in / fade-out for an audio clip',
      builder: (y) =>
        y
          .positional('id', { type: 'string', description: 'Clip ID' })
          .option('in', { type: 'number', description: 'Fade-in duration in seconds' })
          .option('out', { type: 'number', description: 'Fade-out duration in seconds' })
          .example('$0 timeline fade a1 --in 1 --out 2', 'Fade audio clip a1 in over 1s, out over 2s'),
      handler: handleFade,
    })
    .demandCommand(1, 'Please specify a timeline sub-command.')
    .example('$0 timeline show', 'Display the current timeline')
    .example('$0 timeline add video --asset v1 --out 10', 'Add first 10s of v1')
    .example('$0 timeline add-transition c1 c2', 'Add fade transition between c1 and c2');
}

export default { command, desc, builder, handler: () => {} };

// ── Sub-command handlers ──────────────────────────────────────────────────────

/** Handle `timeline add <type>` */
async function handleAdd(argv) {
  const opts = { json: argv.json, quiet: argv.quiet };
  const dir  = resolveProjectDir(argv.project);

  const projectData = await loadProject(dir, opts);
  const model = new TimelineModel(projectData.timeline);

  const type = argv.type;

  if (type === 'text') {
    if (!argv.content) {
      error(Errors.MISSING_VARIABLE, 'Text content is required: use --content "your text"', opts);
    }
    const { id } = model.addClip({
      type:       'text',
      start:      argv.start,
      duration:   argv.duration,
      content:    argv.content,
      fontSize:   argv['font-size'],
      color:      argv.color,
      font:       argv.font,
      align:      argv.align,
      animateIn:  argv['animate-in'],
      animateOut: argv['animate-out'],
    });

    projectData.timeline = model.toJSON();
    await save(dir, projectData);

    print(`Added text clip ${id} at ${argv.start}s`, opts);
    ok({ type: 'ok', op: 'add', clipId: id, track: 'text', start: argv.start, duration: model.getClip(id)?.duration, content: argv.content }, opts);
    return;
  }

  if (!argv.asset) {
    error(Errors.MISSING_VARIABLE, `Asset ID is required for ${type} clips: use --asset <id>`, opts);
  }

  const clipOpts = {
    type,
    asset:      argv.asset,
    start:      argv.start,
    in:         argv.in,
    out:        argv.out,
    duration:   argv.duration,
    speed:      argv.speed,
    volume:     argv.volume,
    animateIn:  argv['animate-in'],
    animateOut: argv['animate-out'],
  };

  if (type === 'audio') {
    clipOpts.loop    = argv.loop;
    clipOpts.fadeIn  = argv['fade-in'];
    clipOpts.fadeOut = argv['fade-out'];
  }

  if (type === 'video' || type === 'image') {
    clipOpts.filter = argv.filter;
  }

  let id;
  try {
    ({ id } = model.addClip(clipOpts));
  } catch (err) {
    mapModelError(err, opts);
  }

  projectData.timeline = model.toJSON();
  await save(dir, projectData);

  print(`Added ${type} clip ${id} (asset ${argv.asset}) at ${argv.start}s`, opts);
  ok({ type: 'ok', op: 'add', clipId: id, track: type === 'video' ? 'video' : type, assetId: argv.asset, start: argv.start }, opts);
}

/** Handle `timeline show` */
async function handleShow(argv) {
  const opts = { json: argv.json, quiet: argv.quiet };
  const dir  = resolveProjectDir(argv.project);

  const projectData = await loadProject(dir, opts);
  const timeline    = projectData.timeline ?? { video: [], audio: [], text: [], transitions: [] };

  if (opts.json) {
    const model = new TimelineModel(timeline);
    print({ type: 'timeline', duration: model.getDuration(), tracks: { video: timeline.video ?? [], audio: timeline.audio ?? [], text: timeline.text ?? [] } }, opts);
    return;
  }

  const table = renderTimeline(timeline, projectData);
  print(table, opts);
}

/** Handle `timeline trim <id> [--in] [--out]` */
async function handleTrim(argv) {
  const opts = { json: argv.json, quiet: argv.quiet };
  const dir  = resolveProjectDir(argv.project);

  if (argv.in == null && argv.out == null) {
    error(Errors.MISSING_VARIABLE, 'At least one of --in or --out must be specified', opts);
  }

  const projectData = await loadProject(dir, opts);
  const model = new TimelineModel(projectData.timeline);

  try {
    model.trim(argv.id, { in: argv.in, out: argv.out });
  } catch (err) {
    mapModelError(err, opts);
  }

  projectData.timeline = model.toJSON();
  await save(dir, projectData);

  print(`Trimmed clip ${argv.id}`, opts);
  ok({ type: 'ok', op: 'trim', clipId: argv.id, in: argv.in, out: argv.out }, opts);
}

/** Handle `timeline split <id> <at>` */
async function handleSplit(argv) {
  const opts = { json: argv.json, quiet: argv.quiet };
  const dir  = resolveProjectDir(argv.project);

  const projectData = await loadProject(dir, opts);
  const model = new TimelineModel(projectData.timeline);

  let left, right;
  try {
    ({ left, right } = model.split(argv.id, argv.at));
  } catch (err) {
    mapModelError(err, opts);
  }

  projectData.timeline = model.toJSON();
  await save(dir, projectData);

  print(`Split clip ${argv.id} at ${argv.at}s → ${left} and ${right}`, opts);
  ok({ type: 'ok', op: 'split', clipId: argv.id, left, right, at: argv.at }, opts);
}

/** Handle `timeline move <id> <start>` */
async function handleMove(argv) {
  const opts = { json: argv.json, quiet: argv.quiet };
  const dir  = resolveProjectDir(argv.project);

  const projectData = await loadProject(dir, opts);
  const model = new TimelineModel(projectData.timeline);

  try {
    model.move(argv.id, argv.start);
  } catch (err) {
    mapModelError(err, opts);
  }

  projectData.timeline = model.toJSON();
  await save(dir, projectData);

  print(`Moved clip ${argv.id} to ${argv.start}s`, opts);
  ok({ type: 'ok', op: 'move', clipId: argv.id, start: argv.start }, opts);
}

/** Handle `timeline remove <id>` */
async function handleRemove(argv) {
  const opts = { json: argv.json, quiet: argv.quiet };
  const dir  = resolveProjectDir(argv.project);

  const projectData = await loadProject(dir, opts);
  const model = new TimelineModel(projectData.timeline);

  try {
    model.remove(argv.id);
  } catch (err) {
    mapModelError(err, opts);
  }

  projectData.timeline = model.toJSON();
  await save(dir, projectData);

  print(`Removed clip ${argv.id}`, opts);
  ok({ type: 'ok', op: 'remove', clipId: argv.id }, opts);
}

/** Handle `timeline add-transition <clip1> <clip2>` */
async function handleAddTransition(argv) {
  const opts = { json: argv.json, quiet: argv.quiet };
  const dir  = resolveProjectDir(argv.project);

  // Parse --params if provided
  let params = undefined;
  if (argv.params) {
    try {
      params = parseTransitionParams(argv.params);
    } catch (err) {
      error(Errors.TRANSITION_INVALID_PARAMS.replace('{name}', argv.effect).replace('{reason}', err.message), err.message, opts);
    }
  }

  const projectData = await loadProject(dir, opts);
  const model = new TimelineModel(projectData.timeline);

  let id;
  try {
    ({ id } = model.addTransition(argv.clip1, argv.clip2, {
      effect:   argv.effect,
      duration: argv.duration,
      params,
    }));
  } catch (err) {
    mapModelError(err, opts);
  }

  projectData.timeline = model.toJSON();
  await save(dir, projectData);

  print(`Added ${argv.effect} transition ${id} between ${argv.clip1} and ${argv.clip2}`, opts);
  ok({
    type:     'ok',
    op:       'add-transition',
    clipId:   id,
    effect:   argv.effect,
    duration: argv.duration,
    params:   params ?? null,
    between:  [argv.clip1, argv.clip2],
  }, opts);
}

/**
 * Parse a comma-separated list of key=value pairs into an object.
 * Handles float, int, bool, vec2, vec3, vec4 values.
 * @param {string} str  e.g. "strength=0.8,amplitude=2.0,direction=[1,0]"
 * @returns {Record<string, any>}
 */
function parseTransitionParams(str) {
  const result = {};
  const parts = str.split(',').map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) throw new Error(`Invalid param '${part}': missing '='`);
    const key   = part.slice(0, eqIdx).trim();
    const value = part.slice(eqIdx + 1).trim();
    if (!key) throw new Error(`Invalid param: empty key in '${part}'`);
    result[key] = parseParamValue(value);
  }
  return result;
}

/**
 * Parse a parameter value string into the appropriate JS type.
 * Handles: booleans, integers, floats, arrays [x,y], [r,g,b], [r,g,b,a], and hex colors.
 * @param {string} v
 * @returns {any}
 */
function parseParamValue(v) {
  // Boolean
  if (v === 'true')  return true;
  if (v === 'false') return false;

  // Integer
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);

  // Float
  if (/^-?\d*\.\d+$/.test(v)) return parseFloat(v);

  // Array: [a, b, c, d]
  if (v.startsWith('[')) {
    const inner = v.replace(/^\[|\]$/g, '').trim();
    if (!inner) return [];
    const items = inner.split(',').map((s) => s.trim());
    // Try to parse each item
    const parsed = items.map((s) => {
      if (/^-?\d+$/.test(s))       return parseInt(s, 10);
      if (/^-?\d*\.\d+$/.test(s)) return parseFloat(s);
      return parseParamValue(s); // nested
    });
    return parsed;
  }

  // Hex color: #rgb or #rrggbb or #rrggbbaa
  if (v.startsWith('#')) return v;

  // Plain float without decimal (e.g. "3")
  const asFloat = parseFloat(v);
  if (!isNaN(asFloat)) return asFloat;

  return v; // fallback to string
}

/** Handle `timeline transitions` */
async function handleTransitions(argv) {
  const opts = { json: argv.json, quiet: argv.quiet };
  const dir  = resolveProjectDir(argv.project);

  const projectData = await loadProject(dir, opts);
  const transitions = projectData.timeline?.transitions ?? [];

  if (opts.json) {
    for (const t of transitions) {
      print({ type: 'transition', ...t }, opts);
    }
    return;
  }

  if (transitions.length === 0) {
    print('No transitions on the timeline.', opts);
    return;
  }

  print('', opts);
  print('  TRANSITIONS', opts);
  print('  ' + '─'.repeat(50), opts);
  for (const t of transitions) {
    print(`  ${t.id.padEnd(6)}  ${(t.type ?? t.effect).padEnd(12)}  ${t.duration}s  between [${t.between.join(', ')}]`, opts);
  }
  print('', opts);
  print(`  Total: ${transitions.length} transition(s)`, opts);
}

/** Handle `timeline speed <id> <mult>` */
async function handleSpeed(argv) {
  const opts = { json: argv.json, quiet: argv.quiet };
  const dir  = resolveProjectDir(argv.project);

  const projectData = await loadProject(dir, opts);
  const model = new TimelineModel(projectData.timeline);

  try {
    model.speed(argv.id, argv.mult);
  } catch (err) {
    mapModelError(err, opts);
  }

  projectData.timeline = model.toJSON();
  await save(dir, projectData);

  print(`Set speed of clip ${argv.id} to ${argv.mult}×`, opts);
  ok({ type: 'ok', op: 'speed', clipId: argv.id, speed: argv.mult }, opts);
}

/** Handle `timeline volume <id> <level>` */
async function handleVolume(argv) {
  const opts = { json: argv.json, quiet: argv.quiet };
  const dir  = resolveProjectDir(argv.project);

  const projectData = await loadProject(dir, opts);
  const model = new TimelineModel(projectData.timeline);

  try {
    model.volume(argv.id, argv.level);
  } catch (err) {
    mapModelError(err, opts);
  }

  projectData.timeline = model.toJSON();
  await save(dir, projectData);

  print(`Set volume of clip ${argv.id} to ${argv.level}`, opts);
  ok({ type: 'ok', op: 'volume', clipId: argv.id, volume: argv.level }, opts);
}

/** Handle `timeline mute <id> [--unmute]` */
async function handleMute(argv) {
  const opts   = { json: argv.json, quiet: argv.quiet };
  const dir    = resolveProjectDir(argv.project);
  const muted  = !argv.unmute;

  const projectData = await loadProject(dir, opts);
  const model = new TimelineModel(projectData.timeline);

  try {
    model.mute(argv.id, muted);
  } catch (err) {
    mapModelError(err, opts);
  }

  projectData.timeline = model.toJSON();
  await save(dir, projectData);

  const action = muted ? 'Muted' : 'Unmuted';
  print(`${action} clip ${argv.id}`, opts);
  ok({ type: 'ok', op: 'mute', clipId: argv.id, muted }, opts);
}

/** Handle `timeline fade <id> [--in] [--out]` */
async function handleFade(argv) {
  const opts = { json: argv.json, quiet: argv.quiet };
  const dir  = resolveProjectDir(argv.project);

  if (argv.in == null && argv.out == null) {
    error(Errors.MISSING_VARIABLE, 'At least one of --in or --out must be specified', opts);
  }

  const projectData = await loadProject(dir, opts);
  const model = new TimelineModel(projectData.timeline);

  try {
    model.fade(argv.id, { in: argv.in, out: argv.out });
  } catch (err) {
    mapModelError(err, opts);
  }

  projectData.timeline = model.toJSON();
  await save(dir, projectData);

  print(`Set fade on clip ${argv.id}`, opts);
  ok({ type: 'ok', op: 'fade', clipId: argv.id, fadeIn: argv.in, fadeOut: argv.out }, opts);
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
 * Map TimelineModel errors to user-friendly output.
 *
 * @param {Error} err
 * @param {{ json?: boolean, quiet?: boolean }} opts
 * @returns {never}
 */
function mapModelError(err, opts) {
  if (err.code === 'CLIP_NOT_FOUND') {
    error(Errors.CLIP_NOT_FOUND, err.message, opts);
  }
  if (err.code === 'INVALID_RANGE') {
    error(Errors.INVALID_RANGE, err.message, opts);
  }
  if (err.code === 'INVALID_TYPE') {
    error(Errors.INVALID_TYPE, err.message, opts);
  }
  throw err;
}
