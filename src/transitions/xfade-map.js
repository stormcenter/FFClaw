/**
 * GL Transitions → FFmpeg xfade mapping
 *
 * Maps all 121 GL transition names (kebab-case) to the closest xfade
 * transition available in standard FFmpeg.  Where no close visual match
 * exists the entry falls back to 'fade'.
 *
 * xfade transitions available in FFmpeg 8.x:
 *   fade, wipeleft, wiperight, wipeup, wipedown,
 *   slideleft, slideright, slideup, slidedown,
 *   circlecrop, rectcrop, distance, fadeblack, fadewhite,
 *   radial, smoothleft, smoothright, smoothup, smoothdown,
 *   circleopen, circleclose, vertopen, vertclose, horzopen, horzclose,
 *   dissolve, pixelize, diagtl, diagtr, diagbl, diagbr,
 *   hlslice, hrslice, vuslice, vdslice, hblur, fadegrays,
 *   wipetl, wipetr, wipebl, wipebr, squeezeh, squeezev,
 *   zoomin, fadefast, fadeslow, hlwind, hrwind, vuwind, vdwind,
 *   coverleft, coverright, coverup, coverdown,
 *   revealleft, revealright, revealup, revealdown
 */

/** @type {Record<string, string>} */
export const XFADE_MAP = {
  // ── A ─────────────────────────────────────────────────────────────────────
  'advanced-mosaic':          'pixelize',
  'angular':                  'radial',

  // ── B ─────────────────────────────────────────────────────────────────────
  'block-dissolve':           'pixelize',
  'book-flip':                'horzopen',
  'bounce':                   'wipedown',
  'bow-tie-horizontal':       'horzopen',
  'bow-tie-vertical':         'vertopen',
  'bow-tie-with-parameter':   'horzopen',
  'box':                      'rectcrop',
  'burn':                     'fadeblack',
  'burn0':                    'fadeblack',
  'butterfly-wave-scrawler':  'distance',

  // ── C ─────────────────────────────────────────────────────────────────────
  'cannabisleaf':             'circleopen',
  'circleopen':               'circleopen',
  'chessboard':               'pixelize',
  'circle':                   'circleopen',
  'circle-crop':              'circlecrop',
  'circleopen':               'circleopen',
  'colour-distance':          'distance',
  'colorphase':               'fadeblack',
  'coord-from-in':            'slideleft',
  'crazy-parametric-fun':     'distance',
  'crosshatch':               'fadegrays',
  'crosswarp':                'distance',
  'cross-zoom':               'zoomin',
  'cube':                     'horzopen',

  // ── D ─────────────────────────────────────────────────────────────────────
  'defocus-blur':             'hblur',
  'dissolve':                 'dissolve',
  'directional':              'wipedown',
  'directional-easing':       'smoothdown',
  'directional-scaled':       'smoothleft',
  'directionalwarp':          'distance',
  'directionalwipe':          'wipeleft',
  'displacement':             'distance',
  'dissolve':                 'dissolve',
  'doom-screen-transition':   'vdslice',
  'doorway':                  'horzopen',
  'dreamy':                   'hblur',
  'dreamy-zoom':              'zoomin',

  // ── E ─────────────────────────────────────────────────────────────────────
  'edge-transition':          'distance',

  // ── F ─────────────────────────────────────────────────────────────────────
  'fade':                     'fade',
  'pixelize':                 'pixelize',
  'fadecolor':                'fadeblack',
  'fadegrayscale':            'fadegrays',
  'film-burn':                'fadeblack',
  'flyeye':                   'circleopen',
  'fold':                     'coverleft',
  'fragment':                 'pixelize',

  // ── G ─────────────────────────────────────────────────────────────────────
  'glitch-displace':          'distance',
  'glitch-memories':          'distance',
  'grid-flip':                'pixelize',

  // ── H ─────────────────────────────────────────────────────────────────────
  'heart':                    'circleopen',
  'hexagonalize':             'pixelize',
  'horizontal-close':         'horzclose',
  'horizontal-open':          'horzopen',
  'hsvfade':                  'fadegrays',

  // ── I ─────────────────────────────────────────────────────────────────────
  'inverted-page-curl':       'coverleft',

  // ── K ─────────────────────────────────────────────────────────────────────
  'kaleidoscope':             'radial',

  // ── L ─────────────────────────────────────────────────────────────────────
  'left-right':               'slideleft',
  'linear-blur':              'hblur',
  'luma':                     'fadegrays',
  'luminance-melt':           'fadeblack',

  // ── M ─────────────────────────────────────────────────────────────────────
  'morph':                    'distance',
  'mosaic':                   'pixelize',
  'mosaic-transition':        'pixelize',
  'multiply-blend':           'fade',

  // ── O ─────────────────────────────────────────────────────────────────────
  'overexposure':             'fadewhite',

  // ── P ─────────────────────────────────────────────────────────────────────
  'parametric-glitch':        'distance',
  'perlin':                   'dissolve',
  'pinwheel':                 'radial',
  'pixelize':                 'pixelize',
  'polar-function':           'radial',
  'polka-dots-curtain':       'circleopen',
  'power-kaleido':            'radial',
  'puzzle-right':             'slideleft',

  // ── R ─────────────────────────────────────────────────────────────────────
  'radial':                   'radial',
  'randomnoisex':             'dissolve',
  'randomsquares':            'pixelize',
  'rectangle':                'rectcrop',
  'rectangle-crop':           'rectcrop',
  'ripple':                   'distance',
  'rolls':                    'coverleft',
  'rotate-scale-fade':        'zoomin',
  'rotate-transition':        'radial',
  'rotate-scale-vanish':      'zoomin',

  // ── S ─────────────────────────────────────────────────────────────────────
  'scale-in':                 'zoomin',
  'simple-flip':              'horzopen',
  'simple-zoom':              'zoomin',
  'simple-zoom-out':          'zoomin',
  'slides':                   'slideleft',
  'split-slide-in-horizontal': 'slideleft',
  'split-slide-in-out-horizontal': 'slideleft',
  'split-slide-in-out-vertical':   'slidedown',
  'split-slide-in-vertical':  'slidedown',
  'split-slide-out-horizontal': 'slideleft',
  'split-slide-out-vertical':  'slidedown',
  'squareswire':              'pixelize',
  'squeeze':                  'squeezeh',
  'star-wipe':                'radial',
  'static-fade':              'fadegrays',
  'static-wipe':              'wipeleft',
  'stereo-viewer':            'distance',
  'swap':                     'horzopen',
  'swirl':                    'radial',

  // ── T ─────────────────────────────────────────────────────────────────────
  'tangent-motion-blur':      'hblur',
  'tiles-wave':               'pixelize',
  'top-bottom':               'slidedown',
  'tv-static':                'dissolve',

  // ── U ─────────────────────────────────────────────────────────────────────
  'undulating-burn-out':      'fadeblack',

  // ── V ─────────────────────────────────────────────────────────────────────
  'vertical-close':           'vertclose',
  'vertical-open':            'vertopen',

  // ── W ─────────────────────────────────────────────────────────────────────
  'water-drop':               'distance',
  'wind':                     'wipeleft',
  'windowblinds':             'vdslice',
  'windowslice':              'vdslice',
  'wipe-down':                'wipedown',
  'wipe-left':                'wipeleft',
  'wipe-right':               'wiperight',
  'wipe-up':                  'wipeup',

  // ── X / Z ─────────────────────────────────────────────────────────────────
  'x-axis-translation':       'slideleft',
  'zoom-in-circles':          'zoomin',
  'zoom-in-out':              'zoomin',
  'zoom-left-wipe':           'wipeleft',
  'zoom-right-wipe':          'wiperight',
};

/**
 * Resolve a GL transition name to an xfade transition name.
 * Falls back to 'fade' for unknown names.
 *
 * @param {string} glName  kebab-case GL transition name (e.g. 'cross-zoom')
 * @returns {string}  xfade transition name (e.g. 'zoomin')
 */
export function toXfade(glName) {
  return XFADE_MAP[glName] ?? 'fade';
}
