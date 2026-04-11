/**
 * ASS Style line generation.
 *
 * Produces a V4+ Style: line from a TextClip object.
 *
 * @module ass/styles
 */

import { resolveFont } from './fonts.js';

/**
 * ASS \an alignment number from position preset + align.
 *
 * \an uses the numpad layout:
 *   7 8 9   top-left top-center top-right
 *   4 5 6   left     center     right
 *   1 2 3   bot-left bot-center bot-right
 *
 * @param {'left'|'center'|'right'} align
 * @param {'top'|'center'|'bottom'} position
 * @returns {number} 1-9
 */
export function alignmentNumber(align = 'center', position = 'bottom') {
  // position='center' is a shorthand for full centering (alignment=5)
  if (position === 'center') return 5;
  const map = {
    'top-left': 7,      'top-center': 8,     'top-right': 9,
    'left': 4,                               'right': 6,
    'bottom-left': 1,   'bottom-center': 2,  'bottom-right': 3,
  };
  const key = `${position}-${align}`;
  return map[key] ?? 2;
}

/**
 * Convert a CSS hex colour (e.g. #ffffff) to ASS ABGR hex (&H00BBGGRR).
 *
 * ASS colour format: &H00BBGGRR (A=00, B=byte0, G=byte1, R=byte2).
 * For CSS #RRGGBB: R=full[0..1], G=full[2..3], B=full[4..5].
 * &H00FFFFFF = white (R=FF, G=FF, B=FF).
 *
 * @param {string} hex  CSS hex, e.g. '#ff0000' or '#f00'
 * @returns {string}    ASS colour, e.g. '&H00FF0000'
 */
export function hexToASSColor(hex) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean;
  // ASS: &H00BBGGRR  (R=full[0..1], G=full[2..3], B=full[4..5])
  const r = full.slice(0, 2).toUpperCase();
  const g = full.slice(2, 4).toUpperCase();
  const b = full.slice(4, 6).toUpperCase();
  return `&H00${b}${g}${r}`;
}

/**
 * Build the ASS Format line for the [Events] section.
 */
export const EVENTS_FORMAT = 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text';

/**
 * Build a complete ASS Style: line from a TextClip.
 *
 * V4+ Style field order:
 * Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour,
 * BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing,
 * Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
 *
 * @param {object} clip   TextClip object
 * @param {string} [styleName='Default']
 * @returns {string}      Complete 'Style: …' line
 */
export function buildStyleLine(clip, styleName = 'Default') {
  const fontSize    = clip.fontSize ?? 60;
  const color       = hexToASSColor(clip.color ?? '#ffffff');
  const outlineColor = hexToASSColor(clip.outlineColor ?? '#000000');
  // BackColour: semi-transparent black for shadow
  const backColor   = '&H80000000';
  const outline     = clip.outline ?? 2;
  const shadow      = clip.shadow ?? 1;
  const bold        = clip.bold ? -1 : 0;
  const italic      = clip.italic ? -1 : 0;
  const align       = alignmentNumber(clip.align ?? 'center', clip.position ?? 'bottom');
  const fontname    = resolveFont(clip.content ?? '', clip.font);

  const fields = [
    styleName,          // Name
    fontname,           // Fontname
    fontSize,           // Fontsize
    color,              // PrimaryColour
    '&H000000FF',       // SecondaryColour (blue — unused)
    outlineColor,       // OutlineColour
    backColor,          // BackColour
    bold,               // Bold
    italic,             // Italic
    0,                  // Underline
    0,                  // StrikeOut
    100,                // ScaleX
    100,                // ScaleY
    0,                  // Spacing
    0,                  // Angle
    1,                  // BorderStyle (1 = outline)
    outline,            // Outline
    shadow,              // Shadow
    align,              // Alignment
    40,                 // MarginL
    40,                 // MarginR
    80,                 // MarginV
    1,                  // Encoding (1 = Unicode)
  ];

  return `Style: ${fields.join(',')}`;
}

/**
 * The Format line for the [V4+ Styles] section.
 */
export const STYLES_FORMAT = [
  'Name', 'Fontname', 'Fontsize', 'PrimaryColour', 'SecondaryColour',
  'OutlineColour', 'BackColour', 'Bold', 'Italic', 'Underline', 'StrikeOut',
  'ScaleX', 'ScaleY', 'Spacing', 'Angle', 'BorderStyle', 'Outline', 'Shadow',
  'Alignment', 'MarginL', 'MarginR', 'MarginV', 'Encoding',
].join(', ');
