/**
 * Unit tests for src/ass/time.js
 */

import { toASSTime, fromASSTime } from '../../src/ass/time.js';

describe('toASSTime', () => {
  // TC-05: time format conversion
  const cases = [
    [0,       '0:00:00.00'],
    [0.5,     '0:00:00.50'],
    [1.0,     '0:00:01.00'],
    [90,      '0:01:30.00'],
    [90.45,   '0:01:30.45'],
    [3600,    '1:00:00.00'],
    [7261.99, '2:01:01.99'],
  ];

  test.each(cases)('TC-05: toASSTime(%p) === %p', (input, expected) => {
    expect(toASSTime(input)).toBe(expected);
  });
});

describe('fromASSTime', () => {
  test('roundtrips with toASSTime', () => {
    const originals = [0, 1.5, 90, 90.45, 3600, 7261.99];
    for (const s of originals) {
      expect(fromASSTime(toASSTime(s))).toBeCloseTo(s, 1);
    }
  });

  test('parses 0:00:00.00 as 0', () => {
    expect(fromASSTime('0:00:00.00')).toBe(0);
  });

  test('parses 1:00:00.00 as 3600', () => {
    expect(fromASSTime('1:00:00.00')).toBe(3600);
  });
});
