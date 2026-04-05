/**
 * Asset store — probe and persist media file information.
 *
 * Wraps ffprobe (via child_process) to extract duration, resolution, and
 * audio-stream presence.  Results are stored in project.assets.
 *
 * @module core/asset-store
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs/promises';
import { nextAssetId } from './id-gen.js';

const execFileAsync = promisify(execFile);

/** Supported media type extensions. */
const EXT_MAP = {
  // video
  mp4: 'video', mov: 'video', avi: 'video', mkv: 'video',
  webm: 'video', flv: 'video', wmv: 'video', m4v: 'video',
  // audio
  mp3: 'audio', wav: 'audio', aac: 'audio', flac: 'audio',
  ogg: 'audio', m4a: 'audio', opus: 'audio',
  // image
  jpg: 'image', jpeg: 'image', png: 'image', gif: 'image',
  webp: 'image', bmp: 'image', tiff: 'image', tif: 'image',
  // subtitle
  srt: 'subtitle', vtt: 'subtitle', ass: 'subtitle', ssa: 'subtitle',
};

/**
 * Detect asset type from file extension.
 *
 * @param {string} filePath
 * @returns {'video'|'audio'|'image'|'subtitle'|null}
 */
export function detectType(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return EXT_MAP[ext] ?? null;
}

/**
 * Probe a media file with ffprobe and return structured metadata.
 *
 * @param {string} filePath  Absolute path to the file.
 * @param {string} [ffmpegPath]  Override ffmpeg/ffprobe directory.
 * @returns {Promise<ProbeResult>}
 *
 * @typedef {object} ProbeResult
 * @property {number|null} duration  Seconds
 * @property {number|null} width
 * @property {number|null} height
 * @property {boolean} hasAudio
 * @property {string|null} codec  Video codec name
 */
export async function probe(filePath, ffmpegPath) {
  const ffprobeBin = ffmpegPath
    ? path.join(ffmpegPath, 'ffprobe')
    : 'ffprobe';

  let stdout;
  try {
    const result = await execFileAsync(ffprobeBin, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath,
    ]);
    stdout = result.stdout;
  } catch (err) {
    const e = new Error(`ffprobe failed for ${filePath}: ${err.message}`);
    e.code = 'FFPROBE_ERROR';
    throw e;
  }

  let info;
  try {
    info = JSON.parse(stdout);
  } catch {
    const e = new Error(`ffprobe returned invalid JSON for ${filePath}`);
    e.code = 'FFPROBE_ERROR';
    throw e;
  }

  const streams = info.streams ?? [];
  const format  = info.format ?? {};

  const videoStream = streams.find((s) => s.codec_type === 'video');
  const audioStream = streams.find((s) => s.codec_type === 'audio');

  const duration = parseFloat(format.duration ?? videoStream?.duration ?? audioStream?.duration);

  return {
    duration: isNaN(duration) ? null : duration,
    width:    videoStream?.width  ?? null,
    height:   videoStream?.height ?? null,
    hasAudio: Boolean(audioStream),
    codec:    videoStream?.codec_name ?? null,
  };
}

/**
 * Add a new asset to the project's asset store.
 *
 * - Resolves the absolute path of the file.
 * - Probes with ffprobe (skipped for subtitle files).
 * - Generates a new asset ID and inserts into project.assets.
 * - Does NOT save the project — caller must call project.save().
 *
 * @param {import('./project.js').ProjectData} projectData
 * @param {string} filePath  Path as provided by the user (may be relative).
 * @param {'video'|'audio'|'image'|'subtitle'|null} [typeOverride]
 * @param {string} [ffmpegPath]
 * @returns {Promise<{ id: string, entry: import('./project.js').AssetEntry }>}
 */
export async function addAsset(projectData, filePath, typeOverride, ffmpegPath) {
  // Validate file exists
  try {
    await fs.access(filePath);
  } catch {
    const e = new Error(`File not found: ${filePath}`);
    e.code = 'ASSET_FILE_NOT_FOUND';
    throw e;
  }

  const type = typeOverride ?? detectType(filePath);
  if (!type) {
    const ext = path.extname(filePath);
    const e = new Error(`Unsupported file extension: ${ext}`);
    e.code = 'UNSUPPORTED_FORMAT';
    throw e;
  }

  // Build entry
  /** @type {import('./project.js').AssetEntry} */
  const entry = { type, path: filePath };

  if (type !== 'subtitle') {
    const meta = await probe(filePath, ffmpegPath);
    if (meta.duration != null) entry.duration = meta.duration;
    if (meta.width    != null) entry.width    = meta.width;
    if (meta.height   != null) entry.height   = meta.height;
    if (type === 'video')      entry.hasAudio = meta.hasAudio;
  }

  const id = nextAssetId(projectData.assets, type);
  projectData.assets[id] = entry;

  return { id, entry };
}

/**
 * Remove an asset from the project asset store.
 * Does NOT remove clips that reference this asset.
 *
 * @param {import('./project.js').ProjectData} projectData
 * @param {string} assetId
 */
export function removeAsset(projectData, assetId) {
  if (!(assetId in projectData.assets)) {
    const e = new Error(`Asset '${assetId}' not found`);
    e.code = 'ASSET_NOT_FOUND';
    throw e;
  }
  delete projectData.assets[assetId];
}

/**
 * Clear all assets from the project.
 *
 * @param {import('./project.js').ProjectData} projectData
 */
export function clearAssets(projectData) {
  projectData.assets = {};
}

/**
 * List all assets grouped by type.
 *
 * @param {import('./project.js').ProjectData} projectData
 * @returns {Record<string, Array<{ id: string } & import('./project.js').AssetEntry>>}
 */
export function listAssets(projectData) {
  const groups = {};
  for (const [id, entry] of Object.entries(projectData.assets)) {
    const { type } = entry;
    if (!groups[type]) groups[type] = [];
    groups[type].push({ id, ...entry });
  }
  return groups;
}
