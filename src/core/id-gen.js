/**
 * ID generators for FFClaw.
 *
 * Two orthogonal ID spaces:
 *   Asset IDs  – v1, v2, a1, i1, s1 (prefix = type initial)
 *   Clip IDs   – c1, c2, c3 ...     (prefix = 'c', global counter)
 *
 * IDs are derived from the current project state so they survive restarts and
 * remain stable across multiple CLI invocations.
 */

/** Prefix map from asset type to letter. */
const ASSET_PREFIX = {
  video: 'v',
  audio: 'a',
  image: 'i',
  subtitle: 's',
};

/**
 * Generate the next asset ID for the given type.
 * Scans existing asset IDs to avoid collisions.
 *
 * @param {Record<string, object>} assets  Current assets map from ffclaw.json
 * @param {'video'|'audio'|'image'|'subtitle'} type
 * @returns {string}  e.g. 'v3'
 */
export function nextAssetId(assets, type) {
  const prefix = ASSET_PREFIX[type];
  if (!prefix) throw new Error(`Unknown asset type: ${type}`);

  const existing = Object.keys(assets)
    .filter((id) => id.startsWith(prefix))
    .map((id) => parseInt(id.slice(prefix.length), 10))
    .filter((n) => !isNaN(n));

  const max = existing.length > 0 ? Math.max(...existing) : 0;
  return `${prefix}${max + 1}`;
}

/**
 * Generate the next clip ID.
 * Scans all tracks in the timeline to find the current maximum.
 *
 * @param {import('./timeline-model.js').TimelineData} timeline
 * @returns {string}  e.g. 'c5'
 */
export function nextClipId(timeline) {
  const all = [
    ...(timeline.video ?? []),
    ...(timeline.audio ?? []),
    ...(timeline.text ?? []),
  ];

  const nums = all
    .map((clip) => clip.id)
    .filter((id) => typeof id === 'string' && id.startsWith('c'))
    .map((id) => parseInt(id.slice(1), 10))
    .filter((n) => !isNaN(n));

  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return `c${max + 1}`;
}
