/**
 * Project file I/O — reads and writes ffclaw.json.
 *
 * Uses write-file-atomic so a crash mid-write never corrupts the project file.
 *
 * @module core/project
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import writeFileAtomic from 'write-file-atomic';

/** Name of the project file on disk. */
export const PROJECT_FILE = 'ffclaw.json';

/** Current supported schema version. */
export const SCHEMA_VERSION = '1.0';

/**
 * @typedef {object} ProjectData
 * @property {string} version
 * @property {string} name
 * @property {string} ratio     e.g. '16:9'
 * @property {number} width
 * @property {number} height
 * @property {number} fps
 * @property {string} bgColor
 * @property {Record<string, AssetEntry>} assets
 * @property {import('./timeline-model.js').TimelineData} timeline
 * @property {Record<string, object>} [filters]  Custom filter presets
 */

/**
 * @typedef {object} AssetEntry
 * @property {'video'|'audio'|'image'|'subtitle'} type
 * @property {string} path
 * @property {number} [duration]
 * @property {number} [width]
 * @property {number} [height]
 * @property {boolean} [hasAudio]
 */

/** Resolution presets. */
export const RATIO_PRESETS = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1':  { width: 1080, height: 1080 },
  '4:3':  { width: 1440, height: 1080 },
};

/**
 * Create a fresh, empty project data object.
 *
 * @param {object} opts
 * @param {string} opts.name
 * @param {string} [opts.ratio]
 * @param {number} [opts.fps]
 * @param {string} [opts.bgColor]
 * @param {number} [opts.width]
 * @param {number} [opts.height]
 * @returns {ProjectData}
 */
export function createProjectData({ name, ratio = '16:9', fps = 30, bgColor = '#000000', width, height }) {
  const preset = RATIO_PRESETS[ratio] ?? RATIO_PRESETS['16:9'];
  return {
    version: SCHEMA_VERSION,
    name,
    ratio,
    width:   width  ?? preset.width,
    height:  height ?? preset.height,
    fps,
    bgColor,
    assets: {},
    timeline: {
      video: [],
      audio: [],
      text: [],
      transitions: [],
    },
    filters: {},
  };
}

/**
 * Resolve the project directory path.
 *
 * Accepts a directory path or defaults to cwd.
 *
 * @param {string} [dir]
 * @returns {string}  Absolute directory path.
 */
export function resolveProjectDir(dir) {
  return path.resolve(dir ?? process.cwd());
}

/**
 * Return the absolute path to the project file inside `dir`.
 *
 * @param {string} dir
 * @returns {string}
 */
export function projectFilePath(dir) {
  return path.join(resolveProjectDir(dir), PROJECT_FILE);
}

/**
 * Load and parse the project file.
 *
 * @param {string} dir  Project directory.
 * @returns {Promise<ProjectData>}
 * @throws {Error} with code PROJECT_NOT_FOUND if missing, INVALID_PROJECT if malformed.
 */
export async function load(dir) {
  const filePath = projectFilePath(dir);

  let raw;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      const e = new Error(`No project file found at ${filePath}`);
      e.code = 'PROJECT_NOT_FOUND';
      throw e;
    }
    throw err;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    const e = new Error(`${filePath} is not valid JSON`);
    e.code = 'INVALID_PROJECT';
    throw e;
  }

  validate(data);
  return data;
}

/**
 * Save project data to disk atomically.
 *
 * @param {string} dir
 * @param {ProjectData} data
 * @returns {Promise<void>}
 */
export async function save(dir, data) {
  const filePath = projectFilePath(dir);
  const json = JSON.stringify(data, null, 2) + '\n';
  await writeFileAtomic(filePath, json, { encoding: 'utf8' });
}

/**
 * Check whether a project already exists in `dir`.
 *
 * @param {string} dir
 * @returns {Promise<boolean>}
 */
export async function exists(dir) {
  try {
    await fs.access(projectFilePath(dir));
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate basic structural correctness of project data.
 * Throws with code INVALID_PROJECT on failure.
 *
 * @param {unknown} data
 */
export function validate(data) {
  if (!data || typeof data !== 'object') {
    throw Object.assign(new Error('Project data must be an object'), { code: 'INVALID_PROJECT' });
  }

  const required = ['version', 'name', 'width', 'height', 'fps', 'assets', 'timeline'];
  for (const key of required) {
    if (!(key in data)) {
      throw Object.assign(
        new Error(`Project file missing required field: ${key}`),
        { code: 'INVALID_PROJECT' },
      );
    }
  }

  const tl = data.timeline;
  if (!tl || typeof tl !== 'object') {
    throw Object.assign(new Error('timeline must be an object'), { code: 'INVALID_PROJECT' });
  }
}
