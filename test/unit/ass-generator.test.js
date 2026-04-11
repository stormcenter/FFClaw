/**
 * Unit tests for src/ass/generator.js
 */

import { generateASS } from '../../src/ass/generator.js';

describe('generateASS (TC-11)', () => {
  test('TC-11: contains required sections', () => {
    const ass = generateASS(
      [{ id: 'c1', type: 'text', content: 'Hello', start: 0, duration: 3 }],
      { width: 1920, height: 1080 }
    );
    expect(ass).toMatch(/\[Script Info\]/);
    expect(ass).toMatch(/PlayResX: 1920/);
    expect(ass).toMatch(/PlayResY: 1080/);
    expect(ass).toMatch(/\[V4\+ Styles\]/);
    expect(ass).toMatch(/Format: Name, Fontname, Fontsize/);
    expect(ass).toMatch(/\[Events\]/);
  });

  test('TC-11: contains Dialogue line with content', () => {
    const ass = generateASS(
      [{ id: 'c1', type: 'text', content: 'Hello', start: 0, duration: 3 }],
      { width: 1920, height: 1080 }
    );
    const dialogueMatch = ass.match(/^Dialogue:.*Hello$/m);
    expect(dialogueMatch).not.toBeNull();
  });

  test('TC-11: generates correct playResX/PlayResY', () => {
    const ass = generateASS([], { width: 1280, height: 720 });
    expect(ass).toMatch(/PlayResX: 1280/);
    expect(ass).toMatch(/PlayResY: 720/);
  });

  test('includes fade animation by default', () => {
    const ass = generateASS(
      [{ id: 'c1', type: 'text', content: 'Test', start: 0, duration: 3 }],
      { width: 1920, height: 1080 }
    );
    expect(ass).toMatch(/\\fad\(/);
  });

  test('TC-10: typewriter generates multiple Dialogue lines', () => {
    const ass = generateASS(
      [{
        id: 'c1',
        type: 'text',
        content: 'Hi!',
        start: 0,
        duration: 3,
        animation: 'typewriter',
        animationParams: { charDelay: 100 },
      }],
      { width: 1920, height: 1080 }
    );
    // Should have 3 Dialogue lines for "Hi!"
    const dialogueLines = ass.match(/^Dialogue:.*/gm);
    expect(dialogueLines).toHaveLength(3);
  });

  test('empty clips array generates valid ASS structure', () => {
    const ass = generateASS([], { width: 1920, height: 1080 });
    expect(ass).toMatch(/\[Script Info\]/);
    expect(ass).toMatch(/\[V4\+ Styles\]/);
    expect(ass).toMatch(/\[Events\]/);
  });
});
