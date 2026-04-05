/**
 * ASCII timeline table renderer.
 *
 * Renders the multi-track timeline as a box-drawing table so the user can
 * get a visual feel of how clips are laid out, similar to a DAW timeline.
 *
 * Example output:
 *
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │ 0s        5s        10s       15s       20s       25s           │
 *   ├─────────────────────── video ────────────────────────────────────┤
 *   │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓[c1: 产品视频A]▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
 *   ├─────────────────────── audio ────────────────────────────────────┤
 *   │ ♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪[a1: bgm ♫ loop]♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪ │
 *   ├─────────────────────── text ─────────────────────────────────────┤
 *   │                   [c4: 春日特惠]                                  │
 *   └──────────────────────────────────────────────────────────────────┘
 *   总时长: 25s
 */

/** Width of the timeline rendering area (columns), excluding border chars. */
const TIMELINE_WIDTH = 64;

/**
 * Render a full timeline table.
 *
 * @param {import('../core/timeline-model.js').TimelineData} timeline
 * @param {import('../core/project.js').ProjectData} project
 * @returns {string}  Multi-line string ready for console output.
 */
export function renderTimeline(timeline, project) {
  const totalDuration = computeTotalDuration(timeline);
  const lines = [];

  // ── top border ──────────────────────────────────────────────────────────
  lines.push('┌' + '─'.repeat(TIMELINE_WIDTH + 2) + '┐');

  // ── ruler ───────────────────────────────────────────────────────────────
  lines.push('│ ' + ruler(totalDuration, TIMELINE_WIDTH) + ' │');

  // ── video track ─────────────────────────────────────────────────────────
  const videoClips = timeline.video ?? [];
  if (videoClips.length > 0) {
    lines.push(trackSeparator('video'));
    lines.push('│ ' + renderTrack(videoClips, totalDuration, '▓', project) + ' │');
    lines.push('│ ' + renderLabels(videoClips, totalDuration, TIMELINE_WIDTH) + ' │');
  }

  // ── audio track ─────────────────────────────────────────────────────────
  const audioClips = timeline.audio ?? [];
  if (audioClips.length > 0) {
    lines.push(trackSeparator('audio'));
    lines.push('│ ' + renderTrack(audioClips, totalDuration, '♪', project) + ' │');
    lines.push('│ ' + renderLabels(audioClips, totalDuration, TIMELINE_WIDTH) + ' │');
  }

  // ── text track ──────────────────────────────────────────────────────────
  const textClips = timeline.text ?? [];
  if (textClips.length > 0) {
    lines.push(trackSeparator('text'));
    lines.push('│ ' + renderTextLabels(textClips, totalDuration, TIMELINE_WIDTH) + ' │');
  }

  // ── bottom border ───────────────────────────────────────────────────────
  lines.push('└' + '─'.repeat(TIMELINE_WIDTH + 2) + '┘');
  lines.push(`总时长: ${formatDuration(totalDuration)}`);

  return lines.join('\n');
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Compute total timeline duration from all clips.
 * @param {import('../core/timeline-model.js').TimelineData} timeline
 * @returns {number}
 */
function computeTotalDuration(timeline) {
  let max = 0;
  const all = [
    ...(timeline.video ?? []),
    ...(timeline.audio ?? []),
    ...(timeline.text ?? []),
  ];
  for (const clip of all) {
    const end = (clip.start ?? 0) + clipDuration(clip);
    if (end > max) max = end;
  }
  return max || 10; // minimum 10s so ruler always renders
}

/**
 * Duration of a single clip (considering in/out, duration field).
 * @param {object} clip
 * @returns {number}
 */
function clipDuration(clip) {
  if (clip.duration != null) return clip.duration;
  if (clip.out != null && clip.in != null) return clip.out - clip.in;
  if (clip.out != null) return clip.out;
  return 0;
}

/**
 * Build a time ruler string.
 * @param {number} totalDuration
 * @param {number} width
 * @returns {string}
 */
function ruler(totalDuration, width) {
  const chars = Array(width).fill(' ');
  const step = chooseLabelStep(totalDuration);
  for (let t = 0; t <= totalDuration; t += step) {
    const col = Math.round((t / totalDuration) * (width - 1));
    if (col >= width) break;
    const label = formatDuration(t);
    for (let i = 0; i < label.length && col + i < width; i++) {
      chars[col + i] = label[i];
    }
  }
  return chars.join('');
}

/**
 * Choose a sensible label interval for the ruler.
 * @param {number} totalDuration
 * @returns {number}
 */
function chooseLabelStep(totalDuration) {
  const candidates = [1, 2, 5, 10, 15, 30, 60, 120, 300];
  for (const s of candidates) {
    if (totalDuration / s <= 8) return s;
  }
  return 300;
}

/**
 * Render one track's bar (filled characters where clips exist).
 * @param {object[]} clips
 * @param {number} totalDuration
 * @param {string} fillChar
 * @param {import('../core/project.js').ProjectData} [project]
 * @returns {string}
 */
function renderTrack(clips, totalDuration, fillChar, _project) {
  const chars = Array(TIMELINE_WIDTH).fill(' ');
  for (const clip of clips) {
    const start = clip.start ?? 0;
    const dur = clipDuration(clip);
    const colStart = Math.round((start / totalDuration) * (TIMELINE_WIDTH - 1));
    const colEnd = Math.min(
      TIMELINE_WIDTH - 1,
      Math.round(((start + dur) / totalDuration) * (TIMELINE_WIDTH - 1)),
    );
    for (let c = colStart; c <= colEnd; c++) {
      chars[c] = fillChar;
    }
  }
  return chars.join('');
}

/**
 * Render clip ID + asset labels below the bar.
 * @param {object[]} clips
 * @param {number} totalDuration
 * @param {number} width
 * @returns {string}
 */
function renderLabels(clips, totalDuration, width) {
  const chars = Array(width).fill(' ');
  for (const clip of clips) {
    const start = clip.start ?? 0;
    const dur = clipDuration(clip);
    const col = Math.round(((start + dur / 2) / totalDuration) * (width - 1));
    const label = buildClipLabel(clip);
    const labelStart = Math.max(0, col - Math.floor(label.length / 2));
    for (let i = 0; i < label.length && labelStart + i < width; i++) {
      chars[labelStart + i] = label[i];
    }
  }
  return chars.join('');
}

/**
 * Render text clip labels (text clips have no bar, just label at position).
 * @param {object[]} clips
 * @param {number} totalDuration
 * @param {number} width
 * @returns {string}
 */
function renderTextLabels(clips, totalDuration, width) {
  const chars = Array(width).fill(' ');
  for (const clip of clips) {
    const start = clip.start ?? 0;
    const dur = clip.duration ?? 3;
    const col = Math.round(((start + dur / 2) / totalDuration) * (width - 1));
    const label = `[${clip.id}: ${clip.content?.slice(0, 10) ?? ''}]`;
    const labelStart = Math.max(0, col - Math.floor(label.length / 2));
    for (let i = 0; i < label.length && labelStart + i < width; i++) {
      chars[labelStart + i] = label[i];
    }
  }
  return chars.join('');
}

/**
 * Build a short display label for a clip.
 * @param {object} clip
 * @returns {string}
 */
function buildClipLabel(clip) {
  let label = `[${clip.id}: ${clip.asset ?? ''}`;
  if (clip.loop) label += ' ♫ loop';
  if (clip.muted) label += ' 🔇';
  label += ']';
  return label;
}

/**
 * Build a track separator line.
 * @param {string} name
 * @returns {string}
 */
function trackSeparator(name) {
  const label = ` ${name} `;
  const side = Math.floor((TIMELINE_WIDTH + 2 - label.length) / 2);
  const remainder = (TIMELINE_WIDTH + 2 - label.length) % 2;
  return '├' + '─'.repeat(side) + label + '─'.repeat(side + remainder) + '┤';
}

/**
 * Format seconds as "Xs" or "X:XX".
 * @param {number} s
 * @returns {string}
 */
function formatDuration(s) {
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}
