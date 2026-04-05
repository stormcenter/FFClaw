/**
 * Filter DSL parser.
 *
 * Translates human-readable filter expressions into FFmpeg-compatible filter strings.
 *
 * Syntax:
 *   "brightness=1.2|contrast=1.1|unsharp"
 *   "hue=0.5|saturation=2"
 *   "denoise=3|sharpen|eq=brightness=0.3:saturation=1.5"
 *
 * Each segment before a pipe (|) is a named filter.  Segments with = are
 * treated as key=value pairs (multiple k=v allowed, separated by colons).
 * Segments without = are treated as simple flag/boolean filters.
 *
 * Supported filters (expand as needed):
 *   brightness, contrast, saturation, hue, gamma, eq,
 *   unsharp, blur, denoise, sharpen, flip, flop, rotate,
 *   scale, crop, pad, fps, hue, invert, Vintage, Noir,
 *   fps, slow, fast, reverse
 *
 * @module core/filter-dsl
 */

/** @typedef {{ name: string, params: Record<string, string|number|boolean> }} ParsedFilter */
/** @typedef {{ filters: ParsedFilter[], raw: string }} ParseResult */

// ── Filter definitions ─────────────────────────────────────────────────────────

/**
 * Map of known filter names → parameter specs.
 * Each spec is an array of { key, type, default? } tuples.
 *
 * type: 'number' | 'string' | 'boolean'
 *
 * @type {Record<string, Array<{key: string, type: 'number'|'string'|'boolean', default?: any}>}
 */
const FILTER_SPECS = {
  // ── Colour / image correction ────────────────────────────────────────────
  brightness:  [{ key: 'brightness', type: 'number', default: 1.0 }],
  contrast:    [{ key: 'contrast',   type: 'number', default: 1.0 }],
  saturation:  [{ key: 'saturation', type: 'number', default: 1.0 }],
  gamma:       [{ key: 'gamma',        type: 'number', default: 1.0 }],
  hue:         [{ key: 'hue',          type: 'number', default: 0.0 }],

  // eq is a multi-param filter expressed as k=v:k=v
  eq: [],

  // ── Resize / geometry ─────────────────────────────────────────────────────
  scale:       [{ key: 'w', type: 'string' }, { key: 'h', type: 'string' }],
  crop:        [{ key: 'w', type: 'string' }, { key: 'h', type: 'string' },
                { key: 'x', type: 'string' }, { key: 'y', type: 'string' }],
  pad:         [{ key: 'w', type: 'string' }, { key: 'h', type: 'string' },
                { key: 'x', type: 'string' }, { key: 'y', type: 'string' },
                { key: 'color', type: 'string' }],

  // ── Blur / sharpen ────────────────────────────────────────────────────────
  unsharp:     [
    { key: 'luma_msize_x', type: 'number', default: 5 },
    { key: 'luma_msize_y', type: 'number', default: 5 },
    { key: 'luma_amount',  type: 'number', default: 1.0 },
  ],
  blur:        [{ key: 'sigma', type: 'number', default: 0.5 }],
  sharpen:     [{ key: 'amount', type: 'number', default: 1.0 }],
  denoise:     [{ key: 'strength', type: 'number', default: 3 }],
  hqdn3d:      [{ key: 'luma_spatial', type: 'number', default: 4 },
                { key: 'chroma_spatial', type: 'number', default: 3 },
                { key: 'luma_tmp', type: 'number', default: 6 },
                { key: 'chroma_tmp', type: 'number', default: 4.5 }],

  // ── Style / effect ────────────────────────────────────────────────────────
  flip:        [],
  flop:        [],
  rotate:      [{ key: 'angle', type: 'number', default: 0 }],
  invert:      [],
  Vintage:     [],
  Noir:        [],
  grayscale:   [],
  sepia:       [],
  edgedetect:  [],
  boxblur:     [{ key: 'radius', type: 'number', default: 2 }],
  median:      [{ key: 'radius', type: 'number', default: 3 }],
  noise:       [{ key: 'strength', type: 'number', default: 10 }],

  // ── Frame / time ───────────────────────────────────────────────────────────
  fps:         [{ key: 'fps', type: 'number', default: 30 }],
  slow:        [{ key: 'factor', type: 'number', default: 2.0 }],
  fast:        [{ key: 'factor', type: 'number', default: 2.0 }],
  reverse:     [],
  setpts:       [{ key: 'expr', type: 'string', default: 'PTS*2' }],
atempo:       [{ key: 'tempo', type: 'number', default: 1.0 }],

  // ── Audio filters (parsed but passed through separately) ───────────────────
  volume:      [{ key: 'level', type: 'number', default: 1.0 }],
  amix:        [{ key: 'inputs', type: 'number', default: 2 }],
  acompressor: [{ key: 'threshold', type: 'number', default: -20 },
                { key: 'ratio', type: 'number', default: 4 }],
};

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse a filter DSL string into structured data.
 *
 * @param {string} expr  e.g. "brightness=1.2|contrast=1.1|unsharp"
 * @returns {ParseResult}
 */
export function parse(expr) {
  if (!expr || typeof expr !== 'string') {
    return { filters: [], raw: expr ?? '' };
  }

  const segments = expr.split('|').map((s) => s.trim()).filter(Boolean);
  const filters  = [];

  for (const segment of segments) {
    const filter = parseSegment(segment);
    if (filter) filters.push(filter);
  }

  return { filters, raw: expr };
}

/**
 * Parse a single segment (between | separators) into a ParsedFilter.
 *
 * Two forms:
 *   name             → { name, params: {} }
 *   name=k=v:k=v     → { name, params: { k: v, ... } }
 *
 * @param {string} segment
 * @returns {ParsedFilter|null}
 */
function parseSegment(segment) {
  const eqIdx = segment.indexOf('=');

  let name;
  let paramStr;

  if (eqIdx === -1) {
    // Simple flag: "unsharp" / "flip"
    name     = segment.toLowerCase();
    paramStr = '';
  } else {
    // "brightness=1.2" or "eq=brightness=0.3:saturation=1.5"
    name     = segment.slice(0, eqIdx).toLowerCase();
    paramStr = segment.slice(eqIdx + 1);
  }

  if (!name) return null;

  const params = parseParams(name, paramStr);
  return { name, params };
}

/**
 * Parse the parameter string after the = sign.
 *
 * @param {string} name     Filter name (for lookup in FILTER_SPECS)
 * @param {string} paramStr  e.g. "brightness=0.3:saturation=1.5" or "1.2"
 * @returns {Record<string, string|number|boolean>}
 */
function parseParams(name, paramStr) {
  if (!paramStr) return {};

  // eq and a few others use : as separator within a single = value
  if (name === 'eq' || paramStr.includes(':')) {
    const params = {};
    const pairs  = paramStr.split(':');
    for (const pair of pairs) {
      const [k, v] = pair.split('=');
      if (k && v != null) {
        params[k.trim()] = coerce(v.trim());
      }
    }
    return params;
  }

  // Single value: "brightness=1.2" → { brightness: 1.2 }
  // Look up spec for the filter to get the key name
  const spec  = FILTER_SPECS[name];
  const key   = spec?.[0]?.key ?? 'value';
  return { [key]: coerce(paramStr) };
}

/**
 * Coerce a string value to a number or boolean if applicable.
 *
 * @param {string} val
 * @returns {string|number|boolean}
 */
function coerce(val) {
  // Boolean literals
  if (val === 'true')  return true;
  if (val === 'false') return false;

  // Numeric
  if (/^-?\d+(\.\d+)?$/.test(val)) return parseFloat(val);

  // String
  return val;
}

// ── FFmpeg compilation ────────────────────────────────────────────────────────

/**
 * Compile a ParseResult (or raw string) into an FFmpeg -vf filter graph string.
 *
 * Returns null if no filters are present.
 *
 * @param {ParseResult|string} input
 * @returns {string|null}
 */
export function toFFmpegFilterString(input) {
  const { filters } = typeof input === 'string' ? parse(input) : input;
  if (filters.length === 0) return null;

  const parts = filters.map(compileFilter);
  return parts.join(',');
}

/**
 * Compile a single ParsedFilter into an FFmpeg filter string fragment.
 *
 * @param {ParsedFilter} filter
 * @returns {string}
 */
function compileFilter(filter) {
  const { name, params } = filter;
  const spec = FILTER_SPECS[name];

  // Build k=v list, filling defaults for any missing keys from the spec
  const args = buildArgs(name, params, spec);

  if (args.length === 0) return name;

  // Handle filters with multiple named parameters
  if (Array.isArray(spec) && spec.length > 0) {
    return `${name}=${args.map(([k, v]) => `${k}=${v}`).join(':')}`;
  }

  // Single-param or unknown filter: key=value or just value
  if (args.length === 1) {
    const [, v] = args[0];
    return `${name}=${v}`;
  }

  return `${name}=${args.map(([k, v]) => `${k}=${v}`).join(':')}`;
}

/**
 * Merge user-provided params with defaults from the filter spec.
 *
 * @param {string} name
 * @param {Record<string, string|number|boolean>} params
 * @param {Array<{key: string, type: string, default?: any}>|undefined} spec
 * @returns {Array<[string, string|number|boolean]>}
 */
function buildArgs(name, params, spec) {
  /** @type {Array<[string, string|number|boolean]>} */
  const args = [];

  if (!spec || spec.length === 0) {
    // No spec: treat params as-is (for eq= and generic filters)
    for (const [k, v] of Object.entries(params)) {
      args.push([k, v]);
    }
    return args;
  }

  // Fill defaults for missing keys, then override with provided params
  const filled = { ...params };

  for (const { key, default: def } of spec) {
    if (!(key in filled) && def !== undefined) {
      filled[key] = def;
    }
  }

  for (const [k, v] of Object.entries(filled)) {
    args.push([k, v]);
  }

  return args;
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Validate a filter expression and return a list of error messages.
 *
 * @param {string} expr
 * @returns {string[]}  Empty array if valid.
 */
export function validate(expr) {
  if (!expr || typeof expr !== 'string') return [];
  const { filters } = parse(expr);
  const errors = [];

  for (const { name } of filters) {
    if (!(name in FILTER_SPECS)) {
      errors.push(`Unknown filter: '${name}'. Known filters: ${Object.keys(FILTER_SPECS).join(', ')}`);
    }
  }

  return errors;
}

/**
 * Return true if the expression is valid (no unknown filters).
 *
 * @param {string} expr
 * @returns {boolean}
 */
export function isValid(expr) {
  return validate(expr).length === 0;
}

/**
 * List all available filter names.
 *
 * @returns {string[]}
 */
export function listFilters() {
  return Object.keys(FILTER_SPECS).sort();
}
