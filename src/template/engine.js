/**
 * Template variable substitution engine.
 *
 * Supports Mustache-style variables in the format {{variableName}}.
 * Variables are sourced from:
 *   1. The project metadata (title, author, etc.)
 *   2. Template context passed at render time
 *   3. Environment variables (prefix with ENV.)
 *
 * Conditional blocks: {{#if variableName}}...{{/if}}
 * Loop blocks:        {{#each listVar}}...{{this}}...{{/each}}
 *
 * Filters (applied with |): uppercase, lowercase, capitalize, trim,
 *                            slug, date,ftime, default, replace
 *
 * @module template/engine
 */

/** @typedef {Record<string, any>} Context */
/** @typedef {{ result: string, missing: string[], replaced: number }} RenderResult */

// ── Variable resolution ───────────────────────────────────────────────────────

/**
 * Resolve a variable name from the context.
 *
 * Supports dot-notation: "project.title", "author.name"
 * Supports ENV. prefix:  "ENV.PATH", "ENV.HOME"
 *
 * @param {string} name
 * @param {Context} ctx
 * @returns {any}
 */
export function resolve(name, ctx) {
  // ENV. prefix → environment variable
  if (name.startsWith('ENV.')) {
    const envKey = name.slice(4);
    return process.env[envKey] ?? null;
  }

  // Dot-notation: "project.title"
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

/**
 * Apply a chain of filters to a value.
 *
 * Supported filters:
 *   uppercase, lowercase, capitalize, trim, slug,
 *   date, ftime, default, replace, json, number, round, floor, ceil
 *
 * @param {any} value
 * @param {string[]} filters
 * @returns {string}
 */
function applyFilters(value, filters) {
  let v = value == null ? '' : String(value);

  for (const filter of filters) {
    const [name, arg] = filter.split(':');
    switch (name) {
      case 'uppercase':  v = v.toUpperCase(); break;
      case 'lowercase':  v = v.toLowerCase(); break;
      case 'capitalize': v = v.charAt(0).toUpperCase() + v.slice(1).toLowerCase(); break;
      case 'trim':       v = v.trim(); break;
      case 'slug':       v = slugify(v); break;
      case 'default':    v = v || arg || ''; break;
      case 'replace': {
        const [from, to] = (arg || '').split('|');
        v = v.replace(new RegExp(from, 'g'), to ?? '');
        break;
      }
      case 'json':       v = JSON.stringify(v); break;
      case 'number':     v = parseFloat(v).toFixed(isNaN(arg) ? 2 : parseInt(arg, 10)); break;
      case 'round':      v = String(Math.round(parseFloat(v))); break;
      case 'floor':      v = String(Math.floor(parseFloat(v))); break;
      case 'ceil':       v = String(Math.ceil(parseFloat(v))); break;
      case 'ftime':      v = formatTime(v, arg); break;
      case 'date':       v = formatDate(v, arg); break;
      default: break;
    }
  }

  return v;
}

/**
 * Slugify a string (for filenames, URLs).
 *
 * @param {string} s
 * @returns {string}
 */
function slugify(s) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Format a number of seconds as a human-readable time string.
 *
 * @param {string|number} seconds
 * @param {string} [fmt]  'hh:mm:ss', 'mm:ss', or 'ss' (default 'mm:ss')
 * @returns {string}
 */
function formatTime(seconds, fmt = 'mm:ss') {
  const s = parseFloat(seconds);
  if (isNaN(s)) return String(seconds);

  if (fmt === 'ss') return String(Math.round(s));

  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);

  if (fmt === 'hh:mm:ss') {
    return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
  }

  // mm:ss
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/**
 * Format a date string or timestamp.
 *
 * @param {string|number} dateVal
 * @param {string} [fmt]  strftime format (default '%Y-%m-%d')
 * @returns {string}
 */
function formatDate(dateVal, fmt = '%Y-%m-%d') {
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal);
  return fmt
    .replace('%Y', d.getFullYear())
    .replace('%m', String(d.getMonth() + 1).padStart(2, '0'))
    .replace('%d', String(d.getDate()).padStart(2, '0'))
    .replace('%H', String(d.getHours()).padStart(2, '0'))
    .replace('%M', String(d.getMinutes()).padStart(2, '0'))
    .replace('%S', String(d.getSeconds()).padStart(2, '0'));
}

// ── Core renderer ────────────────────────────────────────────────────────────

/**
 * Render (substitute) all Mustache-style variables in a template string.
 *
 * @param {string} template
 * @param {Context} ctx
 * @returns {RenderResult}
 */
export function render(template, ctx) {
  if (typeof template !== 'string') {
    return { result: String(template), missing: [], replaced: 0 };
  }

  let result   = template;
  let replaced = 0;
  /** @type {string[]} */
  const missing = [];

  // ── 1. Handle conditional blocks {{#if var}}...{{/if}} ─────────────────────

  result = result.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, varName, inner) => {
      const val = resolve(varName.trim(), ctx);
      return val != null && val !== '' && val !== false && val !== 0 ? inner : '';
    },
  );

  // Handle {{#if var}}...{{else}}...{{/if}}
  result = result.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, varName, ifBlock, elseBlock) => {
      const val = resolve(varName.trim(), ctx);
      return val != null && val !== '' && val !== false && val !== 0 ? ifBlock : elseBlock;
    },
  );

  // ── 2. Handle each loops {{#each var}}...{{this}}...{{/each}} ─────────────

  result = result.replace(
    /\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g,
    (_, varName, inner) => {
      const list = resolve(varName.trim(), ctx);
      if (!Array.isArray(list) || list.length === 0) return '';
      return list.map((item) => {
        return inner.replace(/\{\{this\}\}/g, String(item)).replace(/\{\{\.\}\}/g, String(item));
      }).join('');
    },
  );

  // ── 3. Handle simple variable substitution {{varName}} ────────────────────

  result = result.replace(
    /\{\{([^#/][^}]*?)\}\}/g,
    (match, spec) => {
      const { name, filters } = parseVariableSpec(spec);

      // Skip block helpers
      if (['if', 'else', 'each', 'endif', 'endeach'].includes(name.toLowerCase())) {
        return match;
      }

      const val = resolve(name.trim(), ctx);

      if (val == null || val === '') {
        missing.push(name.trim());
        return match; // Leave unresolved
      }

      const filtered = applyFilters(val, filters);
      replaced++;
      return filtered;
    },
  );

  return { result, missing, replaced };
}

/**
 * Parse a variable spec string into { name, filters }.
 *
 * Handles: "varName", "varName|filter", "varName|filter:arg|filter2"
 *
 * @param {string} spec
 * @returns {{ name: string, filters: string[] }}
 */
export function parseVariableSpec(spec) {
  const parts  = spec.split('|');
  const name   = parts[0].trim();
  const filters = parts.slice(1).map((f) => f.trim()).filter(Boolean);
  return { name, filters };
}

// ── High-level API ────────────────────────────────────────────────────────────

/**
 * Render a template using merged context.
 *
 * Merges (in priority order):
 *   1. project metadata (project.title, project.author, etc.)
 *   2. extraCtx passed as argument
 *   3. process.env (prefixed with ENV.)
 *
 * @param {string} template
 * @param {Context} extraCtx
 * @param {object} [projectMeta]
 * @returns {RenderResult}
 */
export function renderTemplate(template, extraCtx = {}, projectMeta = {}) {
  const ctx = {
    // Project metadata (available as project.title, project.author, etc.)
    project: projectMeta,
    // Env vars prefixed with ENV.
    ...Object.fromEntries(
      Object.entries(process.env).map(([k, v]) => [`ENV.${k}`, v ?? '']),
    ),
    // Extra context overrides everything
    ...extraCtx,
  };

  return render(template, ctx);
}

/**
 * Pre-process a clip's text content with template variables.
 *
 * @param {string} content
 * @param {Context} ctx
 * @returns {RenderResult}
 */
export function renderContent(content, ctx) {
  return render(content, ctx);
}

/**
 * Interpolate a filename pattern with context values.
 *
 * Useful for output filename templates like "{{project.title}}_{{date}}".
 *
 * @param {string} pattern
 * @param {Context} ctx
 * @returns {string}
 */
export function interpolateFilename(pattern, ctx) {
  const { result } = render(pattern, ctx);
  // Sanitize the result for use as a filename
  return result.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
}

/**
 * List all variable names referenced in a template (for validation).
 *
 * @param {string} template
 * @returns {string[]}
 */
export function listVariables(template) {
  /** @type {Set<string>} */
  const vars = new Set();

  const regex = /\{\{([^#/][^}]*?)\}\}/g;
  let m;
  while ((m = regex.exec(template)) !== null) {
    const { name } = parseVariableSpec(m[1]);
    if (name) vars.add(name);
  }

  return [...vars];
}
