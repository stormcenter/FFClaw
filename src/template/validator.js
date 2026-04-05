/**
 * Template variable validator.
 *
 * Validates that all required variables referenced in a template are present
 * in the context, and reports any that are missing or empty.
 *
 * Supports:
 *   - Required variables: {{varName}} must be present
 *   - Optional variables: {{varName?}} are OK to be missing
 *   - Nested context: {{project.title}} (checks ctx.project?.title)
 *   - Env variables: {{ENV.HOME}} are always considered satisfied
 *
 * @module template/validator
 */

import { parseVariableSpec } from './engine.js';

/** @typedef {{ variable: string, line?: number }} MissingVar */
/** @typedef {{ valid: boolean, missing: MissingVar[], optional: string[], allVars: string[] }} ValidationResult */

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Validate a template string against a context object.
 *
 * @param {string} template
 * @param {Record<string, any>} ctx
 * @param {object} [opts]
 * @param {boolean} [opts.strict=false]  If true, treat missing variables as errors instead of warnings
 * @returns {ValidationResult}
 */
export function validate(template, ctx, opts = {}) {
  const allVars   = extractVariables(template);
  const optional  = extractOptionalVariables(template);
  const required  = allVars.filter((v) => !optional.includes(v));

  /** @type {MissingVar[]} */
  const missing = [];

  for (const varName of required) {
    const val = resolveContextVar(varName, ctx);
    if (val == null || val === '') {
      missing.push({ variable: varName });
    }
  }

  // ENV. variables are always satisfied
  const envVars = allVars.filter((v) => v.startsWith('ENV.')).map((v) => ({ variable: v }));
  const envMissing = missing.filter((m) => !m.variable.startsWith('ENV.'));

  return {
    valid:      envMissing.length === 0,
    missing:    envMissing,
    optional,
    allVars,
  };
}

/**
 * Validate a template and throw a descriptive error if any required variables
 * are missing.
 *
 * @param {string} template
 * @param {Record<string, any>} ctx
 * @param {object} [opts]
 * @param {boolean} [opts.strict]
 * @param {string} [opts.templateName]  Name of the template for error messages
 * @returns {ValidationResult}
 * @throws {ValidationError} if validation fails
 */
export function validateOrThrow(template, ctx, opts = {}) {
  const result = validate(template, ctx, opts);

  if (result.missing.length > 0) {
    const err = new ValidationError(
      `Missing required template variable(s): ${result.missing.map((m) => m.variable).join(', ')}`,
      result,
    );
    err.code   = 'MISSING_VARIABLE';
    err.missing = result.missing;
    throw err;
  }

  return result;
}

/**
 * Return a list of all required (non-optional) variables in a template.
 *
 * @param {string} template
 * @returns {string[]}
 */
export function requiredVariables(template) {
  const all     = extractVariables(template);
  const optional = extractOptionalVariables(template);
  return all.filter((v) => !optional.includes(v));
}

// ── Variable extraction ───────────────────────────────────────────────────────

/**
 * Extract all variable names referenced in a template.
 *
 * @param {string} template
 * @returns {string[]}
 */
export function extractVariables(template) {
  /** @type {Set<string>} */
  const vars = new Set();

  // Match {{#if varName}}...{{/if}} conditionals
  const blockRegex = /\{\{#(if|each)\s+([^}]+)\}\}/g;
  let m;
  while ((m = blockRegex.exec(template)) !== null) {
    vars.add(m[2].trim());
  }

  // Match simple {{varName}} and {{varName|filter}}
  const simpleRegex = /\{\{([^#/][^}]*?)\}\}/g;
  while ((m = simpleRegex.exec(template)) !== null) {
    const { name } = parseVariableSpec(m[1]);
    if (name) vars.add(name);
  }

  // Match {{else}} (no var)
  // Match {{/if}} and {{/each}} — no var

  return [...vars];
}

/**
 * Extract variable names marked as optional with trailing ?.
 *
 * @param {string} template
 * @returns {string[]}
 */
export function extractOptionalVariables(template) {
  /** @type {Set<string>} */
  const optional = new Set();

  const regex = /\{\{([^#/][^}]*?)\}\}/g;
  let m;
  while ((m = regex.exec(template)) !== null) {
    const raw = m[1].trim();
    if (raw.endsWith('?')) {
      optional.add(raw.slice(0, -1).trim());
    }
  }

  return [...optional];
}

// ── Context resolution ────────────────────────────────────────────────────────

/**
 * Resolve a variable name from the context, with support for dot-notation.
 *
 * @param {string} name  e.g. "project.title" or "ENV.PATH"
 * @param {Record<string, any>} ctx
 * @returns {any}
 */
function resolveContextVar(name, ctx) {
  // ENV. prefix → always satisfied (we don't check real env vars here)
  if (name.startsWith('ENV.')) return '(env)';

  // Dot-notation
  if (name.includes('.')) {
    const parts = name.split('.');
    let val = ctx;
    for (const part of parts) {
      if (val == null || typeof val !== 'object') return null;
      val = val[part];
    }
    return val ?? null;
  }

  return ctx[name] ?? null;
}


// ── ValidationError ───────────────────────────────────────────────────────────

/**
 * Error thrown when template validation fails.
 *
 * @extends Error
 */
export class ValidationError extends Error {
  /**
   * @param {string} message
   * @param {ValidationResult} result
   */
  constructor(message, result) {
    super(message);
    this.name    = 'ValidationError';
    this.code    = 'MISSING_VARIABLE';
    /** @type {ValidationResult} */
    this.result  = result;
    /** @type {MissingVar[]} */
    this.missing = result.missing;
  }
}

/**
 * Suggest values for missing variables based on common patterns.
 *
 * @param {string[]} missing
 * @returns {Record<string, string>}
 */
export function suggestDefaults(missing) {
  /** @type {Record<string, string>} */
  const suggestions = {};

  for (const name of missing) {
    if (name === 'title' || name === 'project.title') {
      suggestions[name] = 'My Video';
    }
    if (name === 'author' || name === 'project.author') {
      suggestions[name] = process.env.USER ?? 'Anonymous';
    }
    if (name === 'date' || name === 'today') {
      suggestions[name] = new Date().toISOString().slice(0, 10);
    }
    if (name === 'time') {
      suggestions[name] = new Date().toISOString().slice(11, 19);
    }
    if (name === 'year') {
      suggestions[name] = String(new Date().getFullYear());
    }
    if (name === 'version') {
      suggestions[name] = '1.0';
    }
  }

  return suggestions;
}
