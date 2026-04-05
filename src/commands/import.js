/**
 * `clipcraft import` — add media assets to the project.
 *
 * Sub-commands:
 *   import video   <file>     Add a video file
 *   import audio   <file>     Add an audio file
 *   import image   <file>     Add an image file
 *   import subtitle <file>    Add a subtitle file
 *   import list               List all imported assets
 *   import remove  <id>       Remove an asset by ID
 *   import clear              Remove all assets
 *
 * @module commands/import
 */

import path from 'node:path';
import { load, save, resolveProjectDir } from '../core/project.js';
import { addAsset, removeAsset, clearAssets, listAssets } from '../core/asset-store.js';
import { print, ok, error, Errors } from '../utils/output.js';

// ── Yargs command definition ──────────────────────────────────────────────────

export const command = 'import <subcommand>';
export const desc    = 'Manage project assets (video / audio / image / subtitle)';

/** @param {import('yargs').Argv} yargs */
export function builder(yargs) {
  return yargs
    // ── import video ─────────────────────────────────────────────────────────
    .command({
      command: 'video <file>',
      desc: 'Import a video file',
      builder: (y) => mediaBuilder(y, 'video'),
      handler: (argv) => handleAdd(argv, 'video'),
    })
    // ── import audio ─────────────────────────────────────────────────────────
    .command({
      command: 'audio <file>',
      desc: 'Import an audio file',
      builder: (y) => mediaBuilder(y, 'audio'),
      handler: (argv) => handleAdd(argv, 'audio'),
    })
    // ── import image ─────────────────────────────────────────────────────────
    .command({
      command: 'image <file>',
      desc: 'Import an image file',
      builder: (y) => mediaBuilder(y, 'image'),
      handler: (argv) => handleAdd(argv, 'image'),
    })
    // ── import subtitle ───────────────────────────────────────────────────────
    .command({
      command: 'subtitle <file>',
      desc: 'Import a subtitle file (.srt / .vtt / .ass)',
      builder: (y) => mediaBuilder(y, 'subtitle'),
      handler: (argv) => handleAdd(argv, 'subtitle'),
    })
    // ── import list ───────────────────────────────────────────────────────────
    .command({
      command: 'list',
      desc: 'List all imported assets',
      handler: handleList,
    })
    // ── import remove ─────────────────────────────────────────────────────────
    .command({
      command: 'remove <id>',
      desc: 'Remove an asset by ID',
      builder: (y) =>
        y.positional('id', { type: 'string', description: 'Asset ID (e.g. v1, a2)' }),
      handler: handleRemove,
    })
    // ── import clear ──────────────────────────────────────────────────────────
    .command({
      command: 'clear',
      desc: 'Remove all assets from the project',
      builder: (y) =>
        y.option('yes', {
          alias: 'y',
          type: 'boolean',
          description: 'Skip confirmation prompt',
          default: false,
        }),
      handler: handleClear,
    })
    .demandCommand(1, 'Please specify an import sub-command.')
    .example('$0 import video ./footage.mp4', 'Import a video file')
    .example('$0 import audio ./bgm.mp3', 'Import background music')
    .example('$0 import list', 'Show all imported assets')
    .example('$0 import remove v1', 'Remove asset v1');
}

export default { command, desc, builder, handler: () => {} };

// ── Sub-command handlers ──────────────────────────────────────────────────────

/**
 * Shared builder for all media sub-commands.
 *
 * @param {import('yargs').Argv} yargs
 * @param {'video'|'audio'|'image'|'subtitle'} type
 */
function mediaBuilder(yargs, type) {
  return yargs
    .positional('file', {
      type: 'string',
      description: `Path to the ${type} file`,
      normalize: true,
    })
    .example(`$0 import ${type} ./file.${defaultExt(type)}`, `Import a ${type} file`);
}

/**
 * Handle `import video|audio|image|subtitle <file>`.
 *
 * @param {object} argv
 * @param {'video'|'audio'|'image'|'subtitle'} type
 */
async function handleAdd(argv, type) {
  const opts = { json: argv.json, quiet: argv.quiet };
  const dir  = resolveProjectDir(argv.project);

  let projectData;
  try {
    projectData = await load(dir);
  } catch (err) {
    handleLoadError(err, dir, opts);
  }

  // Store path relative to project directory for portability
  const filePath = path.isAbsolute(argv.file)
    ? path.relative(dir, argv.file)
    : argv.file;

  let id, entry;
  try {
    ({ id, entry } = await addAsset(projectData, filePath, type, argv.ffmpeg));
  } catch (err) {
    mapAssetError(err, opts);
  }

  await save(dir, projectData);

  const shortPath = path.relative(process.cwd(), entry.path) || entry.path;
  print(`Imported ${type} as ${id}: ${shortPath}`, opts);
  ok({
    op:   'import',
    id,
    type: entry.type,
    path: entry.path,
    ...(entry.duration != null && { duration: entry.duration }),
    ...(entry.width    != null && { width:    entry.width }),
    ...(entry.height   != null && { height:   entry.height }),
  }, opts);
}

/**
 * Handle `import list`.
 *
 * @param {object} argv
 */
async function handleList(argv) {
  const opts = { json: argv.json, quiet: argv.quiet };
  const dir  = resolveProjectDir(argv.project);

  let projectData;
  try {
    projectData = await load(dir);
  } catch (err) {
    handleLoadError(err, dir, opts);
  }

  const groups = listAssets(projectData);
  const allTypes = ['video', 'audio', 'image', 'subtitle'];

  if (opts.json) {
    // Emit one JSON line per asset
    for (const type of allTypes) {
      for (const asset of (groups[type] ?? [])) {
        print({ type: 'asset', ...asset }, opts);
      }
    }
    return;
  }

  const total = Object.values(groups).reduce((n, arr) => n + arr.length, 0);
  if (total === 0) {
    print('No assets imported yet.  Use `clipcraft import video <file>` to add one.', opts);
    return;
  }

  for (const type of allTypes) {
    const items = groups[type];
    if (!items || items.length === 0) continue;

    print(`\n  ${type.toUpperCase()}`, opts);
    print('  ' + '─'.repeat(60), opts);

    for (const asset of items) {
      const shortPath = path.relative(process.cwd(), asset.path) || asset.path;
      const meta = buildMetaSuffix(asset);
      print(`  ${asset.id.padEnd(6)}  ${shortPath}${meta}`, opts);
    }
  }

  print('', opts);
  print(`  Total: ${total} asset(s)`, opts);
}

/**
 * Handle `import remove <id>`.
 *
 * @param {object} argv
 */
async function handleRemove(argv) {
  const opts = { json: argv.json, quiet: argv.quiet };
  const dir  = resolveProjectDir(argv.project);

  let projectData;
  try {
    projectData = await load(dir);
  } catch (err) {
    handleLoadError(err, dir, opts);
  }

  try {
    removeAsset(projectData, argv.id);
  } catch (err) {
    if (err.code === 'ASSET_NOT_FOUND') {
      error(Errors.ASSET_NOT_FOUND, err.message, opts);
    }
    throw err;
  }

  await save(dir, projectData);
  print(`Removed asset ${argv.id}`, opts);
  ok({ op: 'remove', id: argv.id }, opts);
}

/**
 * Handle `import clear`.
 *
 * @param {object} argv
 */
async function handleClear(argv) {
  const opts = { json: argv.json, quiet: argv.quiet };
  const dir  = resolveProjectDir(argv.project);

  // Confirm unless --yes or non-interactive
  if (!argv.yes && process.stdin.isTTY) {
    const { createInterface } = await import('node:readline/promises');
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = (await rl.question('Remove all assets? This cannot be undone. [y/N] ')).trim();
    rl.close();
    if (!/^y(es)?$/i.test(answer)) {
      print('Cancelled.', opts);
      return;
    }
  }

  let projectData;
  try {
    projectData = await load(dir);
  } catch (err) {
    handleLoadError(err, dir, opts);
  }

  const count = Object.keys(projectData.assets).length;
  clearAssets(projectData);
  await save(dir, projectData);

  print(`Cleared ${count} asset(s)`, opts);
  ok({ op: 'clear', removed: count }, opts);
}

// ── Shared error handlers ─────────────────────────────────────────────────────

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
    error(Errors.PROJECT_NOT_FOUND, `No project found at ${dir}.  Run \`clipcraft new\` first.`, opts);
  }
  if (err.code === 'INVALID_PROJECT') {
    error(Errors.INVALID_PROJECT, err.message, opts);
  }
  throw err;
}

/**
 * Map asset-related errors to user-friendly output.
 *
 * @param {Error} err
 * @param {{ json?: boolean, quiet?: boolean }} opts
 * @returns {never}
 */
function mapAssetError(err, opts) {
  if (err.code === 'ASSET_FILE_NOT_FOUND') {
    error(Errors.ASSET_FILE_NOT_FOUND, err.message, opts);
  }
  if (err.code === 'UNSUPPORTED_FORMAT') {
    error(Errors.UNSUPPORTED_FORMAT, err.message, opts);
  }
  if (err.code === 'FFPROBE_ERROR') {
    error(Errors.FFPROBE_ERROR, err.message, opts);
  }
  throw err;
}

// ── Formatting helpers ────────────────────────────────────────────────────────

/**
 * Build a short metadata suffix string for list output.
 *
 * @param {import('../core/project.js').AssetEntry & { id: string }} asset
 * @returns {string}
 */
function buildMetaSuffix(asset) {
  const parts = [];
  if (asset.duration != null) parts.push(`${asset.duration.toFixed(1)}s`);
  if (asset.width != null && asset.height != null) parts.push(`${asset.width}×${asset.height}`);
  if (asset.hasAudio === false) parts.push('no audio');
  return parts.length > 0 ? `  (${parts.join(', ')})` : '';
}

/**
 * Default file extension for each asset type (for usage examples).
 *
 * @param {'video'|'audio'|'image'|'subtitle'} type
 * @returns {string}
 */
function defaultExt(type) {
  return { video: 'mp4', audio: 'mp3', image: 'jpg', subtitle: 'srt' }[type] ?? 'file';
}
