import { GL_TRANSITIONS } from '../../src/transitions/registry.js';
import { XFADE_MAP, toXfade } from '../../src/transitions/xfade-map.js';

const VALID_XFADE = new Set([
  'fade', 'wipeleft', 'wiperight', 'wipeup', 'wipedown',
  'slideleft', 'slideright', 'slideup', 'slidedown',
  'circlecrop', 'rectcrop', 'distance', 'fadeblack', 'fadewhite',
  'radial', 'smoothleft', 'smoothright', 'smoothup', 'smoothdown',
  'circleopen', 'circleclose', 'vertopen', 'vertclose', 'horzopen', 'horzclose',
  'dissolve', 'pixelize', 'diagtl', 'diagtr', 'diagbl', 'diagbr',
  'hlslice', 'hrslice', 'vuslice', 'vdslice', 'hblur', 'fadegrays',
  'wipetl', 'wipetr', 'wipebl', 'wipebr', 'squeezeh', 'squeezev',
  'zoomin', 'fadefast', 'fadeslow', 'hlwind', 'hrwind', 'vuwind', 'vdwind',
  'coverleft', 'coverright', 'coverup', 'coverdown',
  'revealleft', 'revealright', 'revealup', 'revealdown',
]);

describe('XFADE_MAP', () => {
  const registryKeys = Object.keys(GL_TRANSITIONS);
  const mapKeys      = Object.keys(XFADE_MAP);

  test('has an entry for every registry transition', () => {
    const missing = registryKeys.filter(k => !(k in XFADE_MAP));
    expect(missing).toEqual([]);
  });

  test('all mapped xfade values are valid FFmpeg xfade transition names', () => {
    const invalid = mapKeys.filter(k => !VALID_XFADE.has(XFADE_MAP[k]));
    expect(invalid).toEqual([]);
  });

  test('has no extra keys not present in registry', () => {
    const registrySet = new Set(registryKeys);
    const extra = mapKeys.filter(k => !registrySet.has(k));
    expect(extra).toEqual([]);
  });

  test('map has exactly 121 entries', () => {
    expect(mapKeys).toHaveLength(121);
  });
});

describe('toXfade', () => {
  test('resolves a known name', () => {
    expect(toXfade('cross-zoom')).toBe('zoomin');
    expect(toXfade('fade')).toBe('fade');
    expect(toXfade('circle-crop')).toBe('circlecrop');
  });

  test('falls back to fade for unknown names', () => {
    expect(toXfade('totally-unknown-effect')).toBe('fade');
  });
});
