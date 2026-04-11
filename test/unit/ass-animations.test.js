/**
 * Unit tests for src/ass/animations/
 */

import { fade }  from '../../src/ass/animations/fade.js';
import { none }  from '../../src/ass/animations/none.js';
import { slideUp } from '../../src/ass/animations/slide-up.js';
import {
  buildKaraokeText,
  buildKaraokeDialogue,
} from '../../src/ass/animations/karaoke.js';
import {
  buildTypewriterDialogues,
} from '../../src/ass/animations/typewriter.js';
import { listAnimations, getAnimation } from '../../src/ass/animations/index.js';

describe('fade (TC-07)', () => {
  test('fade({ inDuration: 0.4, outDuration: 0.4 })', () => {
    expect(fade({ inDuration: 0.4, outDuration: 0.4 })).toBe('\\fad(400,400)');
  });
  test('fade({ inDuration: 0.3, outDuration: 0 })', () => {
    expect(fade({ inDuration: 0.3, outDuration: 0 })).toBe('\\fad(300,0)');
  });
  test('fade({ inDuration: 0, outDuration: 0.5 })', () => {
    expect(fade({ inDuration: 0, outDuration: 0.5 })).toBe('\\fad(0,500)');
  });
  test('fade({ inDuration: 1.5, outDuration: 2.0 })', () => {
    expect(fade({ inDuration: 1.5, outDuration: 2.0 })).toBe('\\fad(1500,2000)');
  });
});

describe('none (TC-20)', () => {
  test('none() returns empty string', () => {
    expect(none()).toBe('');
    expect(none({})).toBe('');
    expect(none({ duration: 5, start: 0 })).toBe('');
  });
  test('none() contains no backslash', () => {
    expect(none({ duration: 10 })).not.toMatch(/\\/);
  });
});

describe('slideUp (TC-08)', () => {
  test('includes \\move and \\fad tags', () => {
    const tag = slideUp({
      x: 960, y: 900,
      inDuration: 0.4, outDuration: 0.4,
      playResX: 1920, playResY: 1080,
      params: { offset: 80 },
    });
    expect(tag).toMatch(/\\move\(/);
    expect(tag).toMatch(/\\fad\(400,400\)/);
  });

  test('TC-08: start Y > end Y (slide from below)', () => {
    const tag = slideUp({
      x: 960, y: 900,
      inDuration: 0.4, outDuration: 0.4,
      playResX: 1920, playResY: 1080,
      params: { offset: 80 },
    });
    const moveMatch = tag.match(/\\move\((\d+),(\d+),(\d+),(\d+)\)/);
    expect(moveMatch).not.toBeNull();
    const [, y1, , y2] = moveMatch.slice(1).map(Number);
    expect(y1).toBeGreaterThan(y2);
  });
});

describe('buildKaraokeText (TC-09)', () => {
  test('TC-09: correct \\k tags', () => {
    const text = buildKaraokeText([
      { w: 'Hello', ms: 500 },
      { w: ' ',     ms: 100 },
      { w: 'World', ms: 600 },
    ]);
    expect(text).toBe('{\\k50}Hello{\\k10} {\\k60}World');
  });

  test('empty array returns empty string', () => {
    expect(buildKaraokeText([])).toBe('');
    expect(buildKaraokeText(undefined)).toBe('');
  });
});

describe('buildKaraokeDialogue', () => {
  test('uses karaoke words when available', () => {
    const clip = {
      content: 'Hello World',
      karaokeWords: [{ w: 'Hello', ms: 500 }, { w: ' ', ms: 100 }, { w: 'World', ms: 600 }],
    };
    const result = buildKaraokeDialogue(clip, {});
    expect(result).toBe('{\\k50}Hello{\\k10} {\\k60}World');
  });

  test('falls back to content when no karaoke words', () => {
    const clip = { content: 'Hello' };
    expect(buildKaraokeDialogue(clip, {})).toBe('Hello');
  });
});

describe('buildTypewriterDialogues (TC-10)', () => {
  test('TC-10: correct number of dialogue lines', () => {
    const clip = {
      content: 'Hi!',
      start: 0,
      duration: 3,
      animation: 'typewriter',
      animationParams: { charDelay: 100 },
    };
    const lines = buildTypewriterDialogues(clip, { width: 1920, height: 1080 });
    expect(lines).toHaveLength(3);
  });

  test('TC-10: starts at 0:00:00.00', () => {
    const clip = {
      content: 'Hi!',
      start: 0,
      duration: 3,
      animation: 'typewriter',
      animationParams: { charDelay: 100 },
    };
    const lines = buildTypewriterDialogues(clip, { width: 1920, height: 1080 });
    expect(lines[0]).toMatch(/0:00:00\.00.*,,H$/);
    expect(lines[1]).toMatch(/0:00:00\.10.*,,Hi$/);
    expect(lines[2]).toMatch(/0:00:00\.20.*,,Hi!$/);
  });
});

describe('animation registry', () => {
  test('listAnimations returns all registered metas', () => {
    const anims = listAnimations();
    const names = anims.map(a => a.name);
    expect(names).toContain('fade');
    expect(names).toContain('none');
    expect(names).toContain('slide-up');
    expect(names).toContain('typewriter');
    expect(names).toContain('karaoke');
  });

  test('getAnimation returns undefined for unknown', () => {
    expect(getAnimation('does-not-exist')).toBeUndefined();
  });

  test('getAnimation returns animation by name', () => {
    const anim = getAnimation('fade');
    expect(anim).toBeDefined();
    expect(typeof anim.fn).toBe('function');
    expect(anim.meta.name).toBe('fade');
  });
});
