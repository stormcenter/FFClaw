/**
 * Timeline data model for FFClaw.
 *
 * Provides a fluent in-memory representation of the multi-track timeline.
 * Each mutating method returns `this` so calls can be chained.  Call
 * `.toJSON()` to get the plain object that is persisted in ffclaw.json.
 *
 * Track layout:
 *   video  – VideoClip[]   (includes image clips placed on the video track)
 *   audio  – AudioClip[]
 *   text   – TextClip[]
 *   transitions – Transition[]  (crossfades / wipes between adjacent clips)
 *
 * @module core/timeline-model
 */

import { nextClipId } from './id-gen.js';
import { getGLTransition } from '../transitions/registry.js';
import { validateParams } from '../transitions/params.js';

// ── Type definitions ──────────────────────────────────────────────────────────

/**
 * @typedef {object} VideoClip
 * @property {string} id           e.g. 'c1'
 * @property {string} asset        Asset ID (e.g. 'v1')
 * @property {'video'|'image'} type
 * @property {number} start        Timeline start time in seconds
 * @property {number} [in]         Source in-point (seconds)
 * @property {number} [out]        Source out-point (seconds)
 * @property {number} [duration]   Rendered duration (out-in / speed)
 * @property {number} [speed]      Playback speed multiplier (default 1)
 * @property {number} [volume]     0..1 (default 1)
 * @property {boolean} [muted]     Override volume to 0
 * @property {string|null} [filter]   Filter preset name
 * @property {string|null} [animateIn]   Entry animation
 * @property {string|null} [animateOut]  Exit animation
 */

/**
 * @typedef {object} AudioClip
 * @property {string} id
 * @property {string} asset
 * @property {'audio'} type
 * @property {number} start
 * @property {number} [in]
 * @property {number} [out]
 * @property {number} [duration]
 * @property {number} [speed]
 * @property {number} [volume]
 * @property {boolean} [muted]
 * @property {boolean} [loop]
 * @property {number} [fadeIn]    Fade-in duration in seconds
 * @property {number} [fadeOut]   Fade-out duration in seconds
 */

/**
 * @typedef {object} TextClip
 * @property {string} id
 * @property {'text'} type
 * @property {number} start
 * @property {number} [duration]
 * @property {string} content
 * @property {number} [fontSize]
 * @property {string} [color]
 * @property {string} [font]
 * @property {'left'|'center'|'right'} [align]
 * @property {string|null} [animateIn]
 * @property {string|null} [animateOut]
 */

/**
 * @typedef {object} Transition
 * @property {string} id          e.g. 't1'
 * @property {string} effect      e.g. 'fade', 'wipe', 'dissolve', 'gl:cross-zoom'
 * @property {number} [duration]  Transition duration in seconds (default 0.5)
 * @property {[string, string]} between  [clipId1, clipId2]
 * @property {Record<string,any>} [params]  GL Transition parameters
 */

/**
 * @typedef {object} TimelineData
 * @property {VideoClip[]} video
 * @property {AudioClip[]} audio
 * @property {TextClip[]} text
 * @property {Transition[]} transitions
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Compute a clip's rendered duration on the timeline.
 *
 * @param {VideoClip|AudioClip} clip
 * @returns {number}
 */
function clipRenderedDuration(clip) {
  if (clip.duration != null) return clip.duration;
  if (clip.out != null && clip.in != null) {
    return (clip.out - clip.in) / (clip.speed ?? 1);
  }
  if (clip.out != null) return clip.out / (clip.speed ?? 1);
  return 0;
}

/**
 * Find a clip by ID across all tracks.
 *
 * @param {TimelineData} data
 * @param {string} clipId
 * @returns {{ track: 'video'|'audio'|'text', index: number, clip: object }|null}
 */
function findClip(data, clipId) {
  for (const track of /** @type {('video'|'audio'|'text')[]} */ (['video', 'audio', 'text'])) {
    const arr = data[track];
    const index = arr.findIndex((c) => c.id === clipId);
    if (index !== -1) return { track, index, clip: arr[index] };
  }
  return null;
}

/**
 * Throw a typed error for unknown clip IDs.
 *
 * @param {string} clipId
 * @returns {never}
 */
function throwNotFound(clipId) {
  const e = new Error(`Clip '${clipId}' not found`);
  e.code = 'CLIP_NOT_FOUND';
  throw e;
}

/**
 * Generate the next transition ID.
 *
 * @param {Transition[]} transitions
 * @returns {string}
 */
function nextTransitionId(transitions) {
  const nums = transitions
    .map((t) => t.id)
    .filter((id) => typeof id === 'string' && id.startsWith('t'))
    .map((id) => parseInt(id.slice(1), 10))
    .filter((n) => !isNaN(n));
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return `t${max + 1}`;
}

// ── TimelineModel ─────────────────────────────────────────────────────────────

/**
 * Fluent in-memory model for the FFClaw timeline.
 *
 * Wrap an existing TimelineData object (loaded from disk) to mutate it, then
 * call `.toJSON()` to retrieve the updated plain object for saving.
 *
 * @example
 * const model = new TimelineModel(projectData.timeline);
 * model.addClip({ asset: 'v1', type: 'video', start: 0, in: 0, out: 10 });
 * model.addClip({ asset: 'a1', type: 'audio', start: 0 });
 * projectData.timeline = model.toJSON();
 * await save(dir, projectData);
 */
export class TimelineModel {
  /**
   * @param {TimelineData} [data]  Existing timeline data to wrap.
   */
  constructor(data) {
    /** @type {TimelineData} */
    this._data = data ?? { video: [], audio: [], text: [], transitions: [] };

    // Ensure all track arrays exist (tolerates older project files)
    this._data.video       ??= [];
    this._data.audio       ??= [];
    this._data.text        ??= [];
    this._data.transitions ??= [];
  }

  // ── Clip operations ─────────────────────────────────────────────────────────

  /**
   * Append a new clip to the appropriate track.
   *
   * The caller must supply at minimum `{ asset, type, start }` for media
   * clips, or `{ type: 'text', start, content }` for text clips.
   *
   * @param {Partial<VideoClip|AudioClip|TextClip>} opts
   * @returns {{ id: string }}  The assigned clip ID.
   */
  addClip(opts) {
    const id = nextClipId(this._data);
    const { type } = opts;

    if (type === 'audio') {
      /** @type {AudioClip} */
      const clip = {
        id,
        asset:  opts.asset,
        type:   'audio',
        start:  opts.start ?? 0,
        ...(opts.in       != null && { in:       opts.in }),
        ...(opts.out      != null && { out:      opts.out }),
        ...(opts.duration != null && { duration: opts.duration }),
        ...(opts.speed    != null && { speed:    opts.speed }),
        ...(opts.volume   != null && { volume:   opts.volume }),
        ...(opts.muted    != null && { muted:    opts.muted }),
        ...(opts.loop     != null && { loop:     opts.loop }),
        ...(opts.fadeIn   != null && { fadeIn:   opts.fadeIn }),
        ...(opts.fadeOut  != null && { fadeOut:  opts.fadeOut }),
      };
      this._data.audio.push(clip);
      return { id };
    }

    if (type === 'text') {
      /** @type {TextClip} */
      const clip = {
        id,
        type:     'text',
        start:    opts.start ?? 0,
        duration: opts.duration ?? 3,
        content:  opts.content ?? '',
        ...(opts.fontSize   != null && { fontSize:   opts.fontSize }),
        ...(opts.color      != null && { color:      opts.color }),
        ...(opts.font       != null && { font:       opts.font }),
        ...(opts.align      != null && { align:      opts.align }),
        ...(opts.animateIn  != null && { animateIn:  opts.animateIn }),
        ...(opts.animateOut != null && { animateOut: opts.animateOut }),
      };
      this._data.text.push(clip);
      return { id };
    }

    // video | image
    /** @type {VideoClip} */
    const clip = {
      id,
      asset:  opts.asset,
      type:   type ?? 'video',
      start:  opts.start ?? 0,
      ...(opts.in         != null && { in:         opts.in }),
      ...(opts.out        != null && { out:        opts.out }),
      ...(opts.duration   != null && { duration:   opts.duration }),
      ...(opts.speed      != null && { speed:      opts.speed }),
      ...(opts.volume     != null && { volume:     opts.volume }),
      ...(opts.muted      != null && { muted:      opts.muted }),
      ...(opts.filter     != null && { filter:     opts.filter }),
      ...(opts.animateIn  != null && { animateIn:  opts.animateIn }),
      ...(opts.animateOut != null && { animateOut: opts.animateOut }),
    };
    this._data.video.push(clip);
    return { id };
  }

  /**
   * Trim a clip's in/out points without affecting its timeline start position.
   *
   * @param {string} clipId
   * @param {{ in?: number, out?: number }} range
   * @returns {this}
   */
  trim(clipId, { in: inPoint, out: outPoint }) {
    const found = findClip(this._data, clipId);
    if (!found) throwNotFound(clipId);

    const clip = found.clip;
    if (inPoint  != null) clip.in  = inPoint;
    if (outPoint != null) clip.out = outPoint;

    // Recalculate derived duration
    if (clip.in != null && clip.out != null) {
      clip.duration = (clip.out - clip.in) / (clip.speed ?? 1);
    }

    return this;
  }

  /**
   * Split a clip at `atTime` (seconds on the timeline).
   *
   * The original clip is shortened to end at `atTime`.  A new clip is
   * created that starts at `atTime` and covers the remainder.
   *
   * @param {string} clipId
   * @param {number} atTime  Timeline time in seconds.
   * @returns {{ left: string, right: string }}  IDs of the two resulting clips.
   */
  split(clipId, atTime) {
    const found = findClip(this._data, clipId);
    if (!found) throwNotFound(clipId);

    const { track, clip } = found;
    const start = clip.start ?? 0;
    const dur   = clipRenderedDuration(clip);
    const end   = start + dur;

    if (atTime <= start || atTime >= end) {
      const e = new Error(`Split time ${atTime}s is outside clip range [${start}s, ${end}s]`);
      e.code = 'INVALID_RANGE';
      throw e;
    }

    const offsetInSource = (atTime - start) * (clip.speed ?? 1);
    const sourceIn = clip.in ?? 0;

    // Shorten left clip
    clip.out      = sourceIn + offsetInSource;
    clip.duration = atTime - start;

    // Create right clip (shallow copy of left clip, adjusted)
    const rightOpts = {
      ...clip,
      start:    atTime,
      in:       sourceIn + offsetInSource,
      out:      clip.out + ((end - atTime) * (clip.speed ?? 1)),
      duration: end - atTime,
    };
    delete rightOpts.id;

    const rightId = nextClipId(this._data);
    rightOpts.id = rightId;
    this._data[track].push(rightOpts);

    return { left: clipId, right: rightId };
  }

  /**
   * Move a clip to a new timeline start position.
   *
   * @param {string} clipId
   * @param {number} newStart  Seconds on the timeline.
   * @returns {this}
   */
  move(clipId, newStart) {
    const found = findClip(this._data, clipId);
    if (!found) throwNotFound(clipId);
    found.clip.start = newStart;
    return this;
  }

  /**
   * Remove a clip from the timeline (does not delete the asset).
   *
   * @param {string} clipId
   * @returns {this}
   */
  remove(clipId) {
    for (const track of /** @type {('video'|'audio'|'text')[]} */ (['video', 'audio', 'text'])) {
      const arr = this._data[track];
      const idx = arr.findIndex((c) => c.id === clipId);
      if (idx !== -1) {
        arr.splice(idx, 1);
        // Also clean up any transitions referencing this clip
        this._data.transitions = this._data.transitions.filter(
          (t) => !t.between.includes(clipId),
        );
        return this;
      }
    }
    throwNotFound(clipId);
  }

  // ── Transition operations ───────────────────────────────────────────────────

  /**
   * Add a transition between two adjacent clips.
   *
   * @param {string} clipId1
   * @param {string} clipId2
   * @param {{ effect?: string, duration?: number, params?: Record<string,any> }} [opts]
   * @returns {{ id: string }}  The new transition ID.
   */
  addTransition(clipId1, clipId2, opts = {}) {
    // Validate clip IDs exist
    const allClipIds = this.allClips().map((c) => c.id);
    if (!allClipIds.includes(clipId1)) {
      const e = new Error(`Clip '${clipId1}' not found`);
      e.code = 'CLIP_NOT_FOUND';
      throw e;
    }
    if (!allClipIds.includes(clipId2)) {
      const e = new Error(`Clip '${clipId2}' not found`);
      e.code = 'CLIP_NOT_FOUND';
      throw e;
    }

    // Validate GL Transition params if this is a gl: effect
    const effect = opts.effect ?? opts.type ?? 'fade';
    if (effect.startsWith('gl:')) {
      const name = effect.slice(3);
      const gl   = getGLTransition(name);
      if (!gl) {
        const e = new Error(`GL Transition '${name}' not found in registry`);
        e.code = 'TRANSITION_GLSL_NOT_FOUND';
        throw e;
      }
      if (gl.params && gl.params.length > 0 && opts.params) {
        const errors = validateParams(opts.params, gl.params);
        if (errors.length > 0) {
          const e = new Error(`Invalid parameters: ${errors.join('; ')}`);
          e.code = 'TRANSITION_INVALID_PARAMS';
          throw e;
        }
      }
    }

    const id = nextTransitionId(this._data.transitions);
    /** @type {Transition} */
    const transition = {
      id,
      effect,
      duration: opts.duration ?? 0.5,
      between:  [clipId1, clipId2],
      ...(opts.params && Object.keys(opts.params).length > 0 && { params: opts.params }),
    };
    this._data.transitions.push(transition);
    return { id };
  }

  /**
   * Remove a transition by ID.
   *
   * @param {string} transitionId
   * @returns {this}
   */
  removeTransition(transitionId) {
    const idx = this._data.transitions.findIndex((t) => t.id === transitionId);
    if (idx === -1) {
      const e = new Error(`Transition '${transitionId}' not found`);
      e.code = 'TRANSITION_NOT_FOUND';
      throw e;
    }
    this._data.transitions.splice(idx, 1);
    return this;
  }

  // ── Audio operations ────────────────────────────────────────────────────────

  /**
   * Set playback speed for a clip.
   *
   * @param {string} clipId
   * @param {number} multiplier  e.g. 2.0 = double speed, 0.5 = half speed
   * @returns {this}
   */
  speed(clipId, multiplier) {
    if (multiplier <= 0) {
      const e = new Error('Speed multiplier must be > 0');
      e.code = 'INVALID_RANGE';
      throw e;
    }
    const found = findClip(this._data, clipId);
    if (!found) throwNotFound(clipId);

    const clip = found.clip;
    clip.speed = multiplier;

    // Recompute duration
    if (clip.in != null && clip.out != null) {
      clip.duration = (clip.out - clip.in) / multiplier;
    }

    return this;
  }

  /**
   * Set volume for a clip (0..1).
   *
   * @param {string} clipId
   * @param {number} level  0 = silent, 1 = original
   * @returns {this}
   */
  volume(clipId, level) {
    if (level < 0 || level > 1) {
      const e = new Error('Volume must be between 0 and 1');
      e.code = 'INVALID_RANGE';
      throw e;
    }
    const found = findClip(this._data, clipId);
    if (!found) throwNotFound(clipId);
    found.clip.volume = level;
    return this;
  }

  /**
   * Toggle mute on a clip.
   *
   * @param {string} clipId
   * @param {boolean} [muted=true]
   * @returns {this}
   */
  mute(clipId, muted = true) {
    const found = findClip(this._data, clipId);
    if (!found) throwNotFound(clipId);
    found.clip.muted = muted;
    return this;
  }

  /**
   * Set fade-in / fade-out duration (audio clips only).
   *
   * @param {string} clipId
   * @param {{ in?: number, out?: number }} opts  Duration in seconds
   * @returns {this}
   */
  fade(clipId, { in: fadeIn, out: fadeOut }) {
    const found = findClip(this._data, clipId);
    if (!found) throwNotFound(clipId);
    if (found.track !== 'audio') {
      const e = new Error(`Clip '${clipId}' is not an audio clip`);
      e.code = 'INVALID_TYPE';
      throw e;
    }
    if (fadeIn  != null) found.clip.fadeIn  = fadeIn;
    if (fadeOut != null) found.clip.fadeOut = fadeOut;
    return this;
  }

  // ── Query ───────────────────────────────────────────────────────────────────

  /**
   * Compute the total timeline duration (end time of the last clip).
   *
   * @returns {number}  Seconds
   */
  getDuration() {
    let max = 0;
    for (const track of ['video', 'audio', 'text']) {
      for (const clip of this._data[track]) {
        const end = (clip.start ?? 0) + clipRenderedDuration(clip);
        if (end > max) max = end;
      }
    }
    return max;
  }

  /**
   * Get a single clip by ID (read-only reference).
   *
   * @param {string} clipId
   * @returns {VideoClip|AudioClip|TextClip}
   */
  getClip(clipId) {
    const found = findClip(this._data, clipId);
    if (!found) throwNotFound(clipId);
    return found.clip;
  }

  /**
   * Return all clips across all tracks sorted by timeline start.
   *
   * @returns {Array<VideoClip|AudioClip|TextClip>}
   */
  allClips() {
    return [
      ...this._data.video,
      ...this._data.audio,
      ...this._data.text,
    ].sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
  }

  // ── Serialisation ───────────────────────────────────────────────────────────

  /**
   * Return the plain TimelineData object suitable for JSON serialisation.
   *
   * @returns {TimelineData}
   */
  toJSON() {
    return this._data;
  }
}
