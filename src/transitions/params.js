/**
 * GL Transition Parameter Validation & Conversion
 *
 * Handles type coercion, validation, and FFmpeg env string building for
 * GL Transition shader parameters.
 *
 * Supported types: float, int, bool, vec2, vec3, vec4, ivec2, sampler2D
 */

import { resolve as pathResolve } from 'node:path';

/**
 * Parse a hex color string to RGBA array.
 * Accepts: #rgb, #rrggbb, #rrggbbaa
 * @param {string} hex
 * @returns {[number, number, number, number]} [r,g,b,a] in 0-1 range
 */
export function hexToRgba(hex) {
  const clean = hex.replace(/^#/, '');
  let r, g, b, a = 1;
  if (clean.length === 3) {
    [r, g, b] = clean.split('').map(c => parseInt(c + c, 16) / 255);
  } else if (clean.length === 6) {
    [r, g, b] = [0, 1, 2].map(i => parseInt(clean.slice(i * 2, i * 2 + 2), 16) / 255);
  } else if (clean.length === 8) {
    [r, g, b, a] = [0, 1, 2, 3].map(i => parseInt(clean.slice(i * 2, i * 2 + 2), 16) / 255);
  } else {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  return [r, g, b, a];
}

/**
 * Convert a value to the correct GLSL type string for FFmpeg env.
 * @param {any} value
 * @param {string} type
 * @returns {string}
 */
export function toGLSLString(value, type) {
  switch (type) {
    case 'float':
    case 'int':
      return String(value);

    case 'bool':
      return value ? '1' : '0';

    case 'vec2': {
      const [x = 0, y = 0] = Array.isArray(value) ? value : [value, value];
      return `${Number(x).toFixed(6)},${Number(y).toFixed(6)}`;
    }

    case 'vec3': {
      const [r = 0, g = 0, b = 0] = Array.isArray(value) ? value : [value, value, value];
      return `${Number(r).toFixed(6)},${Number(g).toFixed(6)},${Number(b).toFixed(6)}`;
    }

    case 'vec4': {
      let [r = 0, g = 0, b = 0, a = 1] = value;
      if (typeof value === 'string') {
        [r, g, b, a] = hexToRgba(value);
      } else if (Array.isArray(value)) {
        [r, g, b, a] = value;
      }
      return `${Number(r).toFixed(6)},${Number(g).toFixed(6)},${Number(b).toFixed(6)},${Number(a).toFixed(6)}`;
    }

    case 'ivec2': {
      const [x = 0, y = 0] = Array.isArray(value) ? value : [value, value];
      return `${Math.round(Number(x))},${Math.round(Number(y))}`;
    }

    case 'sampler2D':
      // sampler2D values are paths — return as-is
      return String(value);

    default:
      return String(value);
  }
}

/**
 * Validate a parameter value against its schema entry.
 * Returns null if valid, or an error message string if invalid.
 *
 * @param {any} value
 * @param {{ name: string, type: string, default: any }} schema
 * @returns {string | null}
 */
export function validateParam(value, schema) {
  const { type } = schema;

  switch (type) {
    case 'float':
      if (typeof value !== 'number' || isNaN(value)) {
        return `Expected number for '${schema.name}', got: ${JSON.stringify(value)}`;
      }
      break;

    case 'int':
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        return `Expected integer for '${schema.name}', got: ${JSON.stringify(value)}`;
      }
      break;

    case 'bool':
      if (typeof value !== 'boolean') {
        return `Expected boolean for '${schema.name}', got: ${JSON.stringify(value)}`;
      }
      break;

    case 'vec2':
      if (!Array.isArray(value) || value.length < 2) {
        return `Expected 2-element array for '${schema.name}', got: ${JSON.stringify(value)}`;
      }
      if (value.some(v => typeof v !== 'number' || isNaN(v))) {
        return `All elements of '${schema.name}' must be numbers`;
      }
      break;

    case 'vec3':
      if (!Array.isArray(value) || value.length < 3) {
        return `Expected 3-element array for '${schema.name}', got: ${JSON.stringify(value)}`;
      }
      if (value.some(v => typeof v !== 'number' || isNaN(v))) {
        return `All elements of '${schema.name}' must be numbers`;
      }
      break;

    case 'vec4':
      if (typeof value === 'string') {
        try { hexToRgba(value); } catch {
          return `Invalid hex color '${value}' for '${schema.name}'`;
        }
      } else if (!Array.isArray(value) || value.length < 4) {
        return `Expected 4-element array or hex string for '${schema.name}', got: ${JSON.stringify(value)}`;
      } else if (value.some(v => typeof v !== 'number' || isNaN(v))) {
        return `All elements of '${schema.name}' must be numbers`;
      }
      break;

    case 'ivec2':
      if (!Array.isArray(value) || value.length < 2) {
        return `Expected 2-element integer array for '${schema.name}', got: ${JSON.stringify(value)}`;
      }
      if (value.some(v => typeof v !== 'number' || !Number.isInteger(v))) {
        return `All elements of '${schema.name}' must be integers`;
      }
      break;

    case 'sampler2D':
      if (typeof value !== 'string' && typeof value !== 'number') {
        return `Expected path string for '${schema.name}', got: ${JSON.stringify(value)}`;
      }
      break;

    default:
      break;
  }

  return null;
}

/**
 * Validate all parameters against their schema.
 * Returns an array of error messages (empty = all valid).
 *
 * @param {Record<string, any> | undefined} params
 * @param {Array<{ name: string, type: string, default: any }>} schema
 * @returns {string[]}
 */
export function validateParams(params, schema) {
  if (!params || Object.keys(params).length === 0) return [];
  if (!schema || schema.length === 0) return [];

  const errors = [];
  for (const param of schema) {
    if (params[param.name] !== undefined) {
      const err = validateParam(params[param.name], param);
      if (err) errors.push(err);
    }
  }
  return errors;
}

/**
 * Build an FFmpeg env= parameter string from user params + schema.
 * Uses defaults for any missing params.
 *
 * @param {Record<string, any> | undefined} userParams
 * @param {Array<{ name: string, type: string, default: any }>} schema
 * @param {string} projectDir  — used to resolve sampler2D texture paths
 * @param {string} defaultNoiseTexture  — path to default noise texture
 * @returns {string}  e.g. "strength=0.5;amplitude=1.2" or ""
 */
export function buildEnvString(userParams, schema, projectDir, defaultNoiseTexture) {
  if (!schema || schema.length === 0) return '';

  const entries = [];

  for (const param of schema) {
    let value = (userParams && userParams[param.name] !== undefined)
      ? userParams[param.name]
      : param.default;

    // Resolve sampler2D defaults
    if (param.type === 'sampler2D') {
      if (value === '__default_noise__' || value === undefined) {
        value = defaultNoiseTexture;
      }
      // Resolve relative paths
      if (value && typeof value === 'string' && !value.startsWith('/')) {
        value = pathResolve(projectDir, value);
      }
    }

    entries.push(`${param.name}=${toGLSLString(value, param.type)}`);
  }

  return entries.join(';');
}

export { pathResolve };
