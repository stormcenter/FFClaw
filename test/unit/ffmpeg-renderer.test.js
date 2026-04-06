import { needsFFmpegPipeline } from '../../src/render/ffmpeg-renderer.js';
import { TimelineModel } from '../../src/core/timeline-model.js';

// ── needsFFmpegPipeline ───────────────────────────────────────────────────────

function makeTimeline(video = [], audio = [], text = [], transitions = []) {
  return { video, audio, text, transitions };
}

describe('needsFFmpegPipeline', () => {
  test('returns false when no transitions', () => {
    const model = new TimelineModel(
      makeTimeline([{ id: 'c1', asset: 'v1', type: 'video', start: 0 }]),
    );
    expect(needsFFmpegPipeline(model)).toBe(false);
  });

  test('returns false for built-in (non-gl) transitions', () => {
    const model = new TimelineModel(
      makeTimeline(
        [
          { id: 'c1', asset: 'v1', type: 'video', start: 0 },
          { id: 'c2', asset: 'v2', type: 'video', start: 5 },
        ],
        [], [],
        [{ id: 't1', effect: 'fade', duration: 0.5, between: ['c1', 'c2'] }],
      ),
    );
    expect(needsFFmpegPipeline(model)).toBe(false);
  });

  test('returns true when a gl: transition is present', () => {
    const model = new TimelineModel(
      makeTimeline(
        [
          { id: 'c1', asset: 'v1', type: 'video', start: 0 },
          { id: 'c2', asset: 'v2', type: 'video', start: 5 },
        ],
        [], [],
        [{ id: 't1', effect: 'gl:cross-zoom', duration: 1, between: ['c1', 'c2'] }],
      ),
    );
    expect(needsFFmpegPipeline(model)).toBe(true);
  });

  test('returns true when one of multiple transitions is gl:', () => {
    const model = new TimelineModel(
      makeTimeline(
        [
          { id: 'c1', asset: 'v1', type: 'video', start: 0 },
          { id: 'c2', asset: 'v2', type: 'video', start: 5 },
          { id: 'c3', asset: 'v3', type: 'video', start: 10 },
        ],
        [], [],
        [
          { id: 't1', effect: 'fade',        duration: 0.5, between: ['c1', 'c2'] },
          { id: 't2', effect: 'gl:bounce',   duration: 1,   between: ['c2', 'c3'] },
        ],
      ),
    );
    expect(needsFFmpegPipeline(model)).toBe(true);
  });
});
