import { renderWithFFmpeg } from '../../src/render/ffmpeg-renderer.js';

describe('ffmpeg-renderer', () => {
  test('renderWithFFmpeg is exported as a function', () => {
    expect(typeof renderWithFFmpeg).toBe('function');
  });
});
