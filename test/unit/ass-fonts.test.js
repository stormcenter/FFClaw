/**
 * Unit tests for src/ass/fonts.js
 */

import { resolveFont, FONT_ALIASES, FONTS_DIR } from '../../src/ass/fonts.js';
import path from 'node:path';

describe('resolveFont', () => {
  // TC-02: pure ASCII returns Roboto
  test('TC-02: pure ASCII text returns Roboto', () => {
    expect(resolveFont('Hello World')).toBe('Roboto');
    expect(resolveFont('123 !@#')).toBe('Roboto');
    expect(resolveFont('')).toBe('Roboto');
  });

  // TC-03: CJK text returns Noto Sans CJK SC
  test('TC-03: CJK text returns Noto Sans CJK SC', () => {
    expect(resolveFont('欢迎观看')).toBe('Noto Sans CJK SC');
    expect(resolveFont('Hello 世界')).toBe('Noto Sans CJK SC');
    expect(resolveFont('混合 mixed 内容')).toBe('Noto Sans CJK SC');
  });

  // TC-04: user-specified font takes priority
  test('TC-04: user-specified font takes priority', () => {
    expect(resolveFont('欢迎', 'sans-latin')).toBe('Roboto');
    expect(resolveFont('Hello', 'serif')).toBe('Noto Serif CJK SC');
    expect(resolveFont('test', 'My Custom Font')).toBe('My Custom Font');
    expect(resolveFont('欢迎观看', 'sans')).toBe('Noto Sans CJK SC');
  });
});

describe('FONT_ALIASES', () => {
  test('maps sans to Noto Sans CJK SC', () => {
    expect(FONT_ALIASES['sans']).toBe('Noto Sans CJK SC');
  });
  test('maps serif to Noto Serif CJK SC', () => {
    expect(FONT_ALIASES['serif']).toBe('Noto Serif CJK SC');
  });
  test('maps sans-latin to Roboto', () => {
    expect(FONT_ALIASES['sans-latin']).toBe('Roboto');
  });
});

describe('FONTS_DIR', () => {
  test('FONTS_DIR is an absolute path ending in assets/fonts', () => {
    expect(path.isAbsolute(FONTS_DIR)).toBe(true);
    expect(FONTS_DIR).toMatch(/assets\/fonts$/);
  });
});
