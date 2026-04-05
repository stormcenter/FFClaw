/**
 * `clipcraft new` — initialise a new ClipCraft project.
 *
 * Usage (non-interactive):
 *   clipcraft new my-video --ratio 16:9 --fps 30
 *
 * Usage (interactive — omit positional):
 *   clipcraft new
 *
 * Interactive mode falls back to readline when stdin is a TTY and the
 * required positional <name> argument is missing.
 *
 * @module commands/new
 */

import path from 'node:path';
import readline from 'node:readline/promises';

import {
  createProjectData,
  exists,
  save,
  RATIO_PRESETS,
  resolveProjectDir,
} from '../core/project.js';
import { print, ok, error, Errors } from '../utils/output.js';

// ── Yargs command definition ──────────────────────────────────────────────────

export const command = 'new [name]';
export const desc    = 'Create a new ClipCraft project';

/** @param {import('yargs').Argv} yargs */
export function builder(yargs) {
  return yargs
    .positional('name', {
      type: 'string',
      description: 'Project name (directory will be created if it does not exist)',
    })
    .option('ratio', {
      alias: 'r',
      type: 'string',
      choices: Object.keys(RATIO_PRESETS),
      description: 'Aspect ratio',
      default: '16:9',
    })
    .option('fps', {
      type: 'number',
      description: 'Frames per second',
      default: 30,
    })
    .option('bg', {
      type: 'string',
      description: 'Background colour (CSS hex)',
      default: '#000000',
    })
    .option('force', {
      alias: 'f',
      type: 'boolean',
      description: 'Overwrite existing project file',
      default: false,
    })
    .example('$0 new my-promo --ratio 9:16 --fps 60', 'Vertical short, 60 fps')
    .example('$0 new', 'Interactive setup wizard');
}

/**
 * @param {object} argv  Yargs parsed arguments
 */
export async function handler(argv) {
  const opts = { json: argv.json, quiet: argv.quiet };

  // ── Gather inputs (interactive fallback) ─────────────────────────────────
  let { name, ratio, fps, bg: bgColor } = argv;
  const projectDir = resolveProjectDir(argv.project);

  if (!name) {
    if (!process.stdin.isTTY) {
      error(Errors.MISSING_VARIABLE, 'Project name is required (use --name or pass it as a positional)', opts);
    }
    ({ name, ratio, fps, bgColor } = await promptUser({ ratio, fps, bgColor }));
  }

  // ── Validate fps ──────────────────────────────────────────────────────────
  if (!Number.isInteger(fps) || fps < 1 || fps > 240) {
    error(Errors.INVALID_RANGE, `fps must be an integer between 1 and 240, got: ${fps}`, opts);
  }

  // ── Validate bg colour ────────────────────────────────────────────────────
  if (!/^#[0-9a-fA-F]{6}$/.test(bgColor)) {
    error(Errors.INVALID_RANGE, `bg colour must be a 6-digit hex value like #000000, got: ${bgColor}`, opts);
  }

  // ── Determine output directory ────────────────────────────────────────────
  // If --project was explicitly supplied, use it as-is.
  // Otherwise create a sub-directory named after the project.
  const outDir = argv.project !== process.cwd()
    ? projectDir
    : path.join(projectDir, slugify(name));

  // ── Guard: existing project ───────────────────────────────────────────────
  if (!argv.force && await exists(outDir)) {
    error(
      Errors.PROJECT_ALREADY_EXISTS,
      `A project already exists at ${outDir}.  Use --force to overwrite.`,
      opts,
    );
  }

  // ── Create and save ───────────────────────────────────────────────────────
  const data = createProjectData({ name, ratio, fps, bgColor });

  try {
    await save(outDir, data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      // Directory doesn't exist yet — create it then retry
      const { mkdir } = await import('node:fs/promises');
      await mkdir(outDir, { recursive: true });
      await save(outDir, data);
    } else {
      throw err;
    }
  }

  print(`Project "${name}" created at ${outDir}`, opts);
  ok({ op: 'new', name, ratio, fps, bgColor, dir: outDir }, opts);
}

// ── Default export (yargs command object) ────────────────────────────────────

export default { command, desc, builder, handler };

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Interactive wizard — prompts for all required fields.
 *
 * @param {{ ratio: string, fps: number, bgColor: string }} defaults
 * @returns {Promise<{ name: string, ratio: string, fps: number, bgColor: string }>}
 */
async function promptUser(defaults) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    const name = (await rl.question('Project name: ')).trim();
    if (!name) {
      process.stderr.write('✗ Project name cannot be empty.\n');
      process.exit(1);
    }

    const ratioChoices = Object.keys(RATIO_PRESETS).join(' / ');
    const ratioInput = (await rl.question(`Aspect ratio [${ratioChoices}] (${defaults.ratio}): `)).trim();
    const ratio = ratioInput || defaults.ratio;
    if (!RATIO_PRESETS[ratio]) {
      process.stderr.write(`✗ Invalid ratio: ${ratio}\n`);
      process.exit(1);
    }

    const fpsInput = (await rl.question(`FPS (${defaults.fps}): `)).trim();
    const fps = fpsInput ? parseInt(fpsInput, 10) : defaults.fps;

    const bgInput = (await rl.question(`Background colour (${defaults.bgColor}): `)).trim();
    const bgColor = bgInput || defaults.bgColor;

    return { name, ratio, fps, bgColor };
  } finally {
    rl.close();
  }
}

/**
 * Convert a project name into a safe directory slug.
 *
 * @param {string} name
 * @returns {string}
 */
function slugify(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9\-\u4e00-\u9fff]/g, '')
    .replace(/^-+|-+$/g, '') || 'project';
}
