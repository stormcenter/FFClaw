import { nextAssetId, nextClipId } from '../../src/core/id-gen.js';

describe('nextAssetId', () => {
  test('returns v1 for empty assets', () => {
    expect(nextAssetId({}, 'video')).toBe('v1');
  });

  test('increments past existing video IDs', () => {
    expect(nextAssetId({ v1: {}, v2: {} }, 'video')).toBe('v3');
  });

  test('audio prefix is a', () => {
    expect(nextAssetId({}, 'audio')).toBe('a1');
  });

  test('image prefix is i', () => {
    expect(nextAssetId({}, 'image')).toBe('i1');
  });

  test('subtitle prefix is s', () => {
    expect(nextAssetId({}, 'subtitle')).toBe('s1');
  });

  test('ignores IDs of other types', () => {
    expect(nextAssetId({ v1: {}, a1: {} }, 'audio')).toBe('a2');
  });

  test('throws on unknown type', () => {
    expect(() => nextAssetId({}, 'unknown')).toThrow('Unknown asset type');
  });
});

describe('nextClipId', () => {
  const emptyTimeline = { video: [], audio: [], text: [] };

  test('returns c1 for empty timeline', () => {
    expect(nextClipId(emptyTimeline)).toBe('c1');
  });

  test('increments past existing clips', () => {
    const timeline = {
      video: [{ id: 'c1' }, { id: 'c3' }],
      audio: [{ id: 'c2' }],
      text:  [],
    };
    expect(nextClipId(timeline)).toBe('c4');
  });

  test('handles missing tracks gracefully', () => {
    expect(nextClipId({ video: [{ id: 'c5' }] })).toBe('c6');
  });
});
