/**
 * Unit tests for src/ass/styles.js
 */

import {
  buildStyleLine,
  alignmentNumber,
  hexToASSColor,
} from '../../src/ass/styles.js';

describe('hexToASSColor', () => {
  test('converts #ffffff to &H00FFFFFF', () => {
    expect(hexToASSColor('#ffffff')).toBe('&H00FFFFFF');
  });
  test('converts #ff0000 to &H000000FF (BGR)', () => {
    expect(hexToASSColor('#ff0000')).toBe('&H000000FF');
  });
  test('converts #0000ff to &H00FF0000 (BGR)', () => {
    expect(hexToASSColor('#0000ff')).toBe('&H00FF0000');
  });
  test('converts 3-char shorthand', () => {
    expect(hexToASSColor('#f00')).toBe('&H000000FF');
  });
});

describe('alignmentNumber', () => {
  test('bottom-center defaults to 2', () => {
    expect(alignmentNumber('center', 'bottom')).toBe(2);
  });
  test('top-center is 8', () => {
    expect(alignmentNumber('center', 'top')).toBe(8);
  });
  test('bottom-left is 1', () => {
    expect(alignmentNumber('left', 'bottom')).toBe(1);
  });
  test('bottom-right is 3', () => {
    expect(alignmentNumber('right', 'bottom')).toBe(3);
  });
});

describe('buildStyleLine (TC-06)', () => {
  test('TC-06 clip1: uses Roboto for ASCII text', () => {
    const clip = {
      content: 'Hello',
      fontSize: 60,
      color: '#ffffff',
      outlineColor: '#000000',
      outline: 2,
      shadow: 1,
      font: 'sans-latin',
      bold: false,
      italic: false,
      position: 'bottom',
    };
    const line = buildStyleLine(clip);
    expect(line).toMatch(/^Style: /);
    expect(line).toMatch(/Roboto/);
    expect(line).toMatch(/&H00FFFFFF/);
    // Alignment=2 is the 19th field (index 18)
    const fields = line.split(',');
    expect(fields[18]).toBe('2');
  });

  test('TC-06 clip2: bold + center alignment', () => {
    const clip = {
      content: '标题',
      fontSize: 90,
      color: '#ffff00',
      outlineColor: '#ff0000',
      outline: 3,
      shadow: 2,
      font: 'sans',
      bold: true,
      italic: false,
      position: 'center',
    };
    const line = buildStyleLine(clip);
    expect(line).toMatch(/Noto Sans CJK SC/);
    expect(line).toMatch(/-1/);  // Bold = -1 (true)
    // Alignment=5 appears as the 19th comma-separated field (followed by 40,40,80,1)
    const fields = line.split(',');
    expect(fields[18]).toBe('5');
  });

  test('uses default values when not specified', () => {
    const clip = { content: 'Test' };
    const line = buildStyleLine(clip);
    expect(line).toMatch(/^Style: /);
    // Default fontSize 60
    const fields = line.split(',');
    expect(fields[2]).toBe('60');
  });
});
