import { parse, toFFmpegFilterString, validate, isValid, listFilters } from '../../src/core/filter-dsl.js';

describe('parse', () => {
  test('returns empty filters for empty string', () => {
    expect(parse('').filters).toHaveLength(0);
  });

  test('returns empty filters for null', () => {
    expect(parse(null).filters).toHaveLength(0);
  });

  test('parses simple flag filter', () => {
    const { filters } = parse('flip');
    expect(filters).toHaveLength(1);
    expect(filters[0].name).toBe('flip');
    expect(filters[0].params).toEqual({});
  });

  test('parses single-value filter', () => {
    const { filters } = parse('brightness=1.2');
    expect(filters[0].name).toBe('brightness');
    expect(filters[0].params.brightness).toBe(1.2);
  });

  test('parses multiple filters separated by |', () => {
    const { filters } = parse('brightness=1.2|contrast=0.9|unsharp');
    expect(filters).toHaveLength(3);
    expect(filters[0].name).toBe('brightness');
    expect(filters[1].name).toBe('contrast');
    expect(filters[2].name).toBe('unsharp');
  });

  test('parses eq= with colon-separated params', () => {
    const { filters } = parse('eq=brightness=0.3:saturation=1.5');
    expect(filters[0].name).toBe('eq');
    expect(filters[0].params.brightness).toBe(0.3);
    expect(filters[0].params.saturation).toBe(1.5);
  });

  test('coerces boolean values', () => {
    const { filters } = parse('eq=invert=true');
    expect(filters[0].params.invert).toBe(true);
  });
});

describe('toFFmpegFilterString', () => {
  test('returns null for empty expression', () => {
    expect(toFFmpegFilterString('')).toBeNull();
  });

  test('returns correct vf string for single filter', () => {
    const result = toFFmpegFilterString('flip');
    expect(result).toBe('flip');
  });

  test('returns comma-separated string for multiple filters', () => {
    const result = toFFmpegFilterString('flip|flop');
    expect(result).toContain('flip');
    expect(result).toContain('flop');
    expect(result).toContain(',');
  });

  test('accepts ParseResult object', () => {
    const parsed = parse('brightness=1.5');
    const result = toFFmpegFilterString(parsed);
    expect(result).toContain('brightness');
  });
});

describe('validate', () => {
  test('returns empty array for valid expression', () => {
    expect(validate('brightness=1.2|flip')).toHaveLength(0);
  });

  test('returns error for unknown filter', () => {
    const errors = validate('unknownFilter=1');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('unknownfilter');
  });

  test('returns empty for null/empty', () => {
    expect(validate('')).toHaveLength(0);
    expect(validate(null)).toHaveLength(0);
  });
});

describe('isValid', () => {
  test('returns true for known filters', () => {
    expect(isValid('brightness=1.2|contrast=0.9')).toBe(true);
  });

  test('returns false for unknown filter', () => {
    expect(isValid('magicFilter')).toBe(false);
  });
});

describe('listFilters', () => {
  test('returns sorted array of filter names', () => {
    const filters = listFilters();
    expect(Array.isArray(filters)).toBe(true);
    expect(filters.length).toBeGreaterThan(0);
    expect(filters).toContain('brightness');
    expect(filters).toContain('flip');
    // Should be sorted
    const sorted = [...filters].sort();
    expect(filters).toEqual(sorted);
  });
});
