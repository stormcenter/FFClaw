import { TimelineModel } from '../../src/core/timeline-model.js';

function emptyModel() {
  return new TimelineModel();
}

describe('TimelineModel.addClip', () => {
  test('adds video clip with assigned id c1', () => {
    const m = emptyModel();
    const { id } = m.addClip({ asset: 'v1', type: 'video', start: 0, out: 10 });
    expect(id).toBe('c1');
    expect(m.toJSON().video).toHaveLength(1);
    expect(m.toJSON().video[0].start).toBe(0);
  });

  test('adds audio clip to audio track', () => {
    const m = emptyModel();
    const { id } = m.addClip({ asset: 'a1', type: 'audio', start: 0, loop: true });
    expect(id).toBe('c1');
    expect(m.toJSON().audio[0].loop).toBe(true);
  });

  test('adds text clip to text track', () => {
    const m = emptyModel();
    const { id } = m.addClip({ type: 'text', content: 'Hello', start: 0, duration: 3 });
    expect(id).toBe('c1');
    expect(m.toJSON().text[0].content).toBe('Hello');
  });

  test('increments IDs across tracks', () => {
    const m = emptyModel();
    m.addClip({ asset: 'v1', type: 'video', start: 0, out: 5 });
    m.addClip({ asset: 'a1', type: 'audio', start: 0 });
    const { id } = m.addClip({ asset: 'v2', type: 'video', start: 5, out: 10 });
    expect(id).toBe('c3');
  });
});

describe('TimelineModel.trim', () => {
  test('updates in/out and recalculates duration', () => {
    const m = emptyModel();
    const { id } = m.addClip({ asset: 'v1', type: 'video', start: 0, in: 0, out: 10 });
    m.trim(id, { in: 2, out: 8 });
    const clip = m.getClip(id);
    expect(clip.in).toBe(2);
    expect(clip.out).toBe(8);
    expect(clip.duration).toBe(6);
  });

  test('throws CLIP_NOT_FOUND for unknown id', () => {
    const m = emptyModel();
    expect(() => m.trim('c99', { in: 0, out: 5 })).toThrow(
      expect.objectContaining({ code: 'CLIP_NOT_FOUND' }),
    );
  });
});

describe('TimelineModel.split', () => {
  test('splits clip into two at given time', () => {
    const m = emptyModel();
    const { id } = m.addClip({ asset: 'v1', type: 'video', start: 0, in: 0, out: 10 });
    const { left, right } = m.split(id, 5);
    expect(left).toBe(id);
    const leftClip  = m.getClip(left);
    const rightClip = m.getClip(right);
    expect(leftClip.duration).toBeCloseTo(5);
    expect(rightClip.start).toBeCloseTo(5);
    expect(rightClip.duration).toBeCloseTo(5);
  });

  test('throws INVALID_RANGE when split time is outside clip', () => {
    const m = emptyModel();
    const { id } = m.addClip({ asset: 'v1', type: 'video', start: 0, in: 0, out: 10 });
    expect(() => m.split(id, 0)).toThrow(expect.objectContaining({ code: 'INVALID_RANGE' }));
    expect(() => m.split(id, 15)).toThrow(expect.objectContaining({ code: 'INVALID_RANGE' }));
  });
});

describe('TimelineModel.move', () => {
  test('updates clip start position', () => {
    const m = emptyModel();
    const { id } = m.addClip({ asset: 'v1', type: 'video', start: 0, out: 5 });
    m.move(id, 10);
    expect(m.getClip(id).start).toBe(10);
  });
});

describe('TimelineModel.remove', () => {
  test('removes clip from track', () => {
    const m = emptyModel();
    const { id } = m.addClip({ asset: 'v1', type: 'video', start: 0, out: 5 });
    m.remove(id);
    expect(m.toJSON().video).toHaveLength(0);
  });

  test('throws CLIP_NOT_FOUND for missing id', () => {
    const m = emptyModel();
    expect(() => m.remove('c99')).toThrow(expect.objectContaining({ code: 'CLIP_NOT_FOUND' }));
  });

  test('cleans up transitions referencing the removed clip', () => {
    const m = emptyModel();
    const { id: id1 } = m.addClip({ asset: 'v1', type: 'video', start: 0, in: 0, out: 5 });
    const { id: id2 } = m.addClip({ asset: 'v2', type: 'video', start: 5, in: 0, out: 5 });
    m.addTransition(id1, id2, { effect: 'fade' });
    expect(m.toJSON().transitions).toHaveLength(1);
    m.remove(id1);
    expect(m.toJSON().transitions).toHaveLength(0);
  });
});

describe('TimelineModel.addTransition', () => {
  test('adds transition between two clips', () => {
    const m = emptyModel();
    const { id: id1 } = m.addClip({ asset: 'v1', type: 'video', start: 0, in: 0, out: 5 });
    const { id: id2 } = m.addClip({ asset: 'v2', type: 'video', start: 5, in: 0, out: 5 });
    const { id: tid } = m.addTransition(id1, id2, { effect: 'fade', duration: 1 });
    expect(tid).toBe('t1');
    const t = m.toJSON().transitions[0];
    expect(t.between).toEqual([id1, id2]);
    expect(t.duration).toBe(1);
  });

  test('throws CLIP_NOT_FOUND for unknown clip', () => {
    const m = emptyModel();
    const { id } = m.addClip({ asset: 'v1', type: 'video', start: 0, out: 5 });
    expect(() => m.addTransition(id, 'c99')).toThrow(
      expect.objectContaining({ code: 'CLIP_NOT_FOUND' }),
    );
  });
});

describe('TimelineModel.speed', () => {
  test('sets speed and recalculates duration', () => {
    const m = emptyModel();
    const { id } = m.addClip({ asset: 'v1', type: 'video', start: 0, in: 0, out: 10 });
    m.speed(id, 2);
    const clip = m.getClip(id);
    expect(clip.speed).toBe(2);
    expect(clip.duration).toBeCloseTo(5);
  });

  test('throws INVALID_RANGE for speed <= 0', () => {
    const m = emptyModel();
    const { id } = m.addClip({ asset: 'v1', type: 'video', start: 0, out: 5 });
    expect(() => m.speed(id, 0)).toThrow(expect.objectContaining({ code: 'INVALID_RANGE' }));
  });
});

describe('TimelineModel.volume and mute', () => {
  test('sets volume', () => {
    const m = emptyModel();
    const { id } = m.addClip({ asset: 'v1', type: 'video', start: 0, out: 5 });
    m.volume(id, 0.5);
    expect(m.getClip(id).volume).toBe(0.5);
  });

  test('throws INVALID_RANGE for out-of-range volume', () => {
    const m = emptyModel();
    const { id } = m.addClip({ asset: 'v1', type: 'video', start: 0, out: 5 });
    expect(() => m.volume(id, 1.5)).toThrow(expect.objectContaining({ code: 'INVALID_RANGE' }));
  });

  test('mutes clip', () => {
    const m = emptyModel();
    const { id } = m.addClip({ asset: 'v1', type: 'video', start: 0, out: 5 });
    m.mute(id);
    expect(m.getClip(id).muted).toBe(true);
  });
});

describe('TimelineModel.fade', () => {
  test('sets fade on audio clip', () => {
    const m = emptyModel();
    const { id } = m.addClip({ asset: 'a1', type: 'audio', start: 0 });
    m.fade(id, { in: 1, out: 2 });
    const clip = m.getClip(id);
    expect(clip.fadeIn).toBe(1);
    expect(clip.fadeOut).toBe(2);
  });

  test('throws INVALID_TYPE on non-audio clip', () => {
    const m = emptyModel();
    const { id } = m.addClip({ asset: 'v1', type: 'video', start: 0, out: 5 });
    expect(() => m.fade(id, { in: 1 })).toThrow(expect.objectContaining({ code: 'INVALID_TYPE' }));
  });
});

describe('TimelineModel.getDuration', () => {
  test('returns 0 for empty timeline', () => {
    expect(emptyModel().getDuration()).toBe(0);
  });

  test('returns max end time across tracks', () => {
    const m = emptyModel();
    m.addClip({ asset: 'v1', type: 'video', start: 0, in: 0, out: 10 });
    m.addClip({ asset: 'a1', type: 'audio', start: 5, duration: 15 });
    expect(m.getDuration()).toBe(20);
  });
});

describe('TimelineModel.allClips', () => {
  test('returns clips sorted by start time', () => {
    const m = emptyModel();
    m.addClip({ asset: 'v1', type: 'video', start: 10, out: 5 });
    m.addClip({ asset: 'a1', type: 'audio', start: 0 });
    const clips = m.allClips();
    expect(clips[0].start).toBe(0);
    expect(clips[1].start).toBe(10);
  });
});
