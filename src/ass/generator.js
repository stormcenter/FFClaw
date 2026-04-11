/**
 * ASS file generator — converts TextClip[] to .ass file content.
 *
 * @module ass/generator
 */

import { FONTS_DIR } from './fonts.js';
import { toASSTime } from './time.js';
import { buildStyleLine, EVENTS_FORMAT, STYLES_FORMAT } from './styles.js';
import {
  getAnimation,
  buildTypewriterDialogues,
  buildKaraokeDialogue,
} from './animations/index.js';

/**
 * Build an AnimationContext from a TextClip and position parameters.
 *
 * @param {object} clip
 * @param {object} ctx
 * @param {number} ctx.playResX
 * @param {number} ctx.playResY
 * @param {number} ctx.x   Center X (px)
 * @param {number} ctx.y   Center Y (px)
 * @returns {object}
 */
function buildAnimContext(clip, ctx) {
  return {
    inDuration:  clip.animateInDuration  ?? 0.4,
    outDuration: clip.animateOutDuration ?? 0.4,
    clipDuration: clip.duration ?? 3,
    playResX: ctx.playResX,
    playResY: ctx.playResY,
    x: ctx.x,
    y: ctx.y,
    text: clip.content ?? '',
    params: clip.animationParams ?? {},
  };
}

/**
 * Build a single Dialogue line for a TextClip.
 *
 * @param {object} clip
 * @param {object} ctx  { playResX, playResY, x, y }
 * @returns {string}
 */
function buildDialogue(clip, ctx) {
  const start     = clip.start ?? 0;
  const end       = start + (clip.duration ?? 3);
  const animation = clip.animation ?? 'fade';
  const styleName = 'Default';

  // Compute subtitle position (center of screen if not set)
  const x = ctx.x ?? Math.floor(ctx.playResX / 2);
  const y = ctx.y ?? Math.floor(ctx.playResY * 0.85);

  const animCtx = buildAnimContext(clip, { ...ctx, x, y });
  const anim = getAnimation(animation);

  // Karaoke uses its own Dialogue builder
  if (animation === 'karaoke') {
    const text = buildKaraokeDialogue(clip, animCtx);
    const startTag = `{\\pos(${x},${y})}`;
    return [
      'Dialogue: 0',
      toASSTime(start),
      toASSTime(end),
      styleName,
      '',
      '0', '0', '0',
      '',
      `${startTag}${text}`,
    ].join(',');
  }

  // Typewriter generates multiple Dialogue lines directly
  if (animation === 'typewriter') {
    return null; // handled separately
  }

  // Normal single Dialogue line
  const tag = anim ? anim.fn(animCtx) : '';
  const overrideTag = tag ? `{${tag}}` : '';

  return [
    'Dialogue: 0',
    toASSTime(start),
    toASSTime(end),
    styleName,
    '',
    '0', '0', '0',
    '',
    `${overrideTag}${clip.content ?? ''}`,
  ].join(',');
}

/**
 * Generate the complete ASS file content from an array of TextClips.
 *
 * @param {object[]} clips     Array of TextClip objects
 * @param {object} opts
 * @param {number} opts.width   Video width in pixels (PlayResX)
 * @param {number} opts.height  Video height in pixels (PlayResY)
 * @returns {string}           Full ASS file content
 */
export function generateASS(clips, { width, height }) {
  const playResX = width  ?? 1920;
  const playResY = height ?? 1080;
  const ctx = { playResX, playResY, x: Math.floor(playResX / 2), y: Math.floor(playResY * 0.85) };

  const lines = [];

  // ── [Script Info] ─────────────────────────────────────────────────────────
  lines.push('[Script Info]');
  lines.push('ScriptType: v4.00+');
  lines.push('Collisions: Normal');
  lines.push(`PlayResX: ${playResX}`);
  lines.push(`PlayResY: ${playResY}`);
  lines.push('Timer: 100.0000');
  lines.push('');

  // ── [V4+ Styles] ─────────────────────────────────────────────────────────
  lines.push('[V4+ Styles]');
  lines.push(`Format: ${STYLES_FORMAT}`);
  // Generate one style per unique font+size combo — we use a single 'Default' style for simplicity
  // Build a representative clip for the default style
  const defaultClip = clips.find(() => true) ?? { fontSize: 60, color: '#ffffff', outlineColor: '#000000', outline: 2, shadow: 1, bold: false, italic: false, align: 'center', position: 'bottom' };
  lines.push(buildStyleLine(defaultClip));
  lines.push('');

  // ── [Events] ─────────────────────────────────────────────────────────────
  lines.push('[Events]');
  lines.push(EVENTS_FORMAT);

  // Collect Dialogue lines
  for (const clip of clips) {
    if (!clip.content && !clip.karaokeWords) continue;

    // Typewriter generates multiple lines per clip
    if (clip.animation === 'typewriter') {
      const twLines = buildTypewriterDialogues(clip, { width: playResX, height: playResY });
      lines.push(...twLines);
      continue;
    }

    const dialogue = buildDialogue(clip, ctx);
    if (dialogue) lines.push(dialogue);
  }

  lines.push('');
  return lines.join('\n');
}
