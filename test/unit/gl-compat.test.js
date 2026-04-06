import { resolveTransitionFilter, resetCapabilityCache } from '../../src/render/gl-compat.js';

describe('resolveTransitionFilter', () => {
  beforeEach(() => {
    resetCapabilityCache();
  });

  // Shared capability override for GL transition tests
  const glCaps = { gltransition: true, xfade: true };

  describe('GL transitions (gl: prefix)', () => {
    test('throws TRANSITION_GLSL_NOT_FOUND for unknown transition', async () => {
      await expect(
        resolveTransitionFilter({
          effect: 'gl:does-not-exist',
          duration: 1,
          offset: 0,
          _caps: glCaps,
        })
      ).rejects.toMatchObject({ code: 'TRANSITION_GLSL_NOT_FOUND' });
    });

    test('converts camelCase to kebab-case for lookup (crossZoom → cross-zoom)', async () => {
      // This should work - camelCase input should resolve to kebab-case registry key
      const filter = await resolveTransitionFilter({
        effect: 'gl:crossZoom',
        duration: 1,
        offset: 0,
        _caps: glCaps,
      });
      expect(filter).toContain('gltransition');
      expect(filter).toContain('CrossZoom.glsl'); // GLSL file from registry
    });

    test('resolves kebab-case input correctly', async () => {
      const filter = await resolveTransitionFilter({
        effect: 'gl:cross-zoom',
        duration: 1,
        offset: 0,
        _caps: glCaps,
      });
      expect(filter).toContain('gltransition');
    });

    test('includes strength param in env string', async () => {
      const filter = await resolveTransitionFilter({
        effect: 'gl:cross-zoom',
        duration: 1,
        offset: 0,
        params: { strength: 0.8 },
        _caps: glCaps,
      });
      expect(filter).toContain('env=');
      expect(filter).toContain('strength=0.8');
    });

    test('uses default values for missing params', async () => {
      const filter = await resolveTransitionFilter({
        effect: 'gl:cross-zoom',
        duration: 1,
        offset: 0,
        _caps: glCaps,
        // no params provided - should use defaults
      });
      expect(filter).toContain('strength=0.4'); // default 0.4
    });

    test('handles no-params transitions (e.g. fade)', async () => {
      const filter = await resolveTransitionFilter({
        effect: 'gl:fade',
        duration: 1,
        offset: 0,
        _caps: glCaps,
      });
      expect(filter).toContain('gltransition');
      // no env param for no-param transitions
    });

    test('handles vec4 params (bgcolor)', async () => {
      const filter = await resolveTransitionFilter({
        effect: 'gl:circle-crop',
        duration: 1,
        offset: 0,
        params: { bgcolor: [0, 0, 0, 1] },
        _caps: glCaps,
      });
      expect(filter).toContain('env=');
      expect(filter).toContain('bgcolor=');
    });

    test('handles bool params', async () => {
      const filter = await resolveTransitionFilter({
        effect: 'gl:bow-tie-with-parameter',
        duration: 1,
        offset: 0,
        params: { reverse: true },
        _caps: glCaps,
      });
      expect(filter).toContain('reverse=1'); // bool -> 1
    });

    test('handles ivec2 params', async () => {
      const filter = await resolveTransitionFilter({
        effect: 'gl:pixelize',
        duration: 1,
        offset: 0,
        params: { squaresMin: [30, 30] },
        _caps: glCaps,
      });
      expect(filter).toContain('squaresMin=30,30'); // ivec2 -> int,int
    });
  });

  describe('non-GL transitions (no gl: prefix)', () => {
    test('returns xfade filter for built-in transitions', async () => {
      const filter = await resolveTransitionFilter({
        effect: 'fade',
        duration: 1,
        offset: 0,
      });
      expect(filter).toContain('xfade');
      expect(filter).toContain('transition=fade');
    });

    test('returns xfade filter for wipe-left', async () => {
      const filter = await resolveTransitionFilter({
        effect: 'wipe-left',
        duration: 1,
        offset: 0,
      });
      expect(filter).toContain('xfade=transition=wipeleft');
    });
  });
});
