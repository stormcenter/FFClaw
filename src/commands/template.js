/**
 * `ffclaw template` — manage and apply text templates.
 *
 * Sub-commands:
 *   template list                       List saved templates
 *   template create  <name> <content>  Save a named text template
 *   template apply   <name>             Apply template to a text clip
 *   template show    <name>             Show a template's raw content
 *   template remove  <name>             Delete a saved template
 *   template render  <name>              Render a template with project context
 *   template vars    <name>              List variables referenced in a template
 *
 * @module commands/template
 */

import { load, save, resolveProjectDir } from '../core/project.js';
import { requiredVariables } from '../template/validator.js';
import { renderTemplate, renderContent, interpolateFilename, listVariables } from '../template/engine.js';
import { print, ok, error, Errors } from '../utils/output.js';

// ── Yargs command definition ──────────────────────────────────────────────────

export const command = 'template <subcommand>';
export const desc    = 'Manage and apply text templates with variable substitution';

export function builder(yargs) {
  return yargs
    // ── template list ────────────────────────────────────────────────────────
    .command({
      command: 'list',
      desc: 'List all saved templates',
      handler: handleList,
    })
    // ── template create ──────────────────────────────────────────────────────
    .command({
      command: 'create <name> <content>',
      desc: 'Save a named text template with variable placeholders',
      builder: (y) =>
        y
          .positional('name',    { type: 'string', description: 'Template name' })
          .positional('content', { type: 'string', description: 'Template content (use {{var}} for variables)' })
          .option('description', {
            alias: 'd',
            type: 'string',
            description: 'Short description of the template',
          })
          .option('required', {
            alias: 'r',
            type: 'string',
            description: 'Comma-separated list of required variable names',
          })
          .example('$0 template create intro "Welcome to {{title}}!"', 'Create a simple intro template')
          .example('$0 template create intro "Episode {{episode}} - {{title}}"', 'Create template with variables'),
      handler: handleCreate,
    })
    // ── template apply ───────────────────────────────────────────────────────
    .command({
      command: 'apply <name>',
      desc: 'Apply a saved template to a text clip',
      builder: (y) =>
        y
          .positional('name', { type: 'string', description: 'Template name' })
          .option('clip-id', {
            alias: 'c',
            type: 'string',
            description: 'Text clip ID to update (creates a new clip if omitted)',
          })
          .option('var', {
            type: 'string',
            description: 'Variable values as key=value pairs (can be repeated)',
          })
          .option('start', { type: 'number', default: 0 })
          .option('duration', { alias: 'd', type: 'number', default: 3 })
          .example('$0 template apply intro --clip-id c1 --var title="My Show"', 'Apply template to existing clip')
          .example('$0 template apply intro --var title="My Show" --start 0 --duration 3', 'Create new clip from template'),
      handler: handleApply,
    })
    // ── template show ─────────────────────────────────────────────────────────
    .command({
      command: 'show <name>',
      desc: 'Show the raw content of a saved template',
      builder: (y) =>
        y.positional('name', { type: 'string', description: 'Template name' }),
      handler: handleShow,
    })
    // ── template remove ───────────────────────────────────────────────────────
    .command({
      command: 'remove <name>',
      desc: 'Delete a saved template',
      builder: (y) =>
        y.positional('name', { type: 'string', description: 'Template name' }),
      handler: handleRemove,
    })
    // ── template render ───────────────────────────────────────────────────────
    .command({
      command: 'render <name>',
      desc: 'Render a template with current project context and show the result',
      builder: (y) =>
        y
          .positional('name', { type: 'string', description: 'Template name' })
          .option('var', {
            type: 'string',
            description: 'Variable values as key=value pairs (can be repeated)',
          })
          .example('$0 template render intro --var title="My Show"', 'Render and preview a template'),
      handler: handleRender,
    })
    // ── template vars ─────────────────────────────────────────────────────────
    .command({
      command: 'vars <name>',
      desc: 'List all variables referenced in a template',
      builder: (y) =>
        y.positional('name', { type: 'string', description: 'Template name' }),
      handler: handleVars,
    })
    .demandCommand(1, 'Please specify a template sub-command.')
    .example('$0 template list', 'Show all saved templates')
    .example('$0 template create title "Episode {{episode}}"', 'Save a template');
}

export default { command, desc, builder, handler: () => {} };

// ── Sub-command handlers ──────────────────────────────────────────────────────

/** Handle `template list` */
async function handleList(argv) {
  const opts = { json: argv.json, quiet: argv.quiet };
  const dir  = resolveProjectDir(argv.project);

  let projectData;
  try {
    projectData = await load(dir);
  } catch (err) {
    handleLoadError(err, dir, opts);
  }

  const templates = projectData.templates ?? {};

  if (opts.json) {
    for (const [name, tpl] of Object.entries(templates)) {
      print({ type: 'template', name, ...(/** @type {any} */ (tpl)) }, opts);
    }
    return;
  }

  const names = Object.keys(templates);
  if (names.length === 0) {
    print('No templates saved.  Use `ffclaw template create <name> <content>` to save one.', opts);
    return;
  }

  print('\n  SAVED TEMPLATES', opts);
  print('  ' + '─'.repeat(70), opts);

  for (const name of names) {
    const tpl = /** @type {any} */ (templates[name]);
    const vars = tpl.content ? listVariables(tpl.content) : [];
    const preview = tpl.content
      ? tpl.content.slice(0, 60) + (tpl.content.length > 60 ? '…' : '')
      : '';
    print(`  ${name.padEnd(20)}  ${preview}`, opts);
    if (vars.length > 0) {
      print(`    variables: ${vars.join(', ')}`, opts);
    }
  }

  print('', opts);
  print(`  Total: ${names.length} template(s)`, opts);
}

/** Handle `template create <name> <content>` */
async function handleCreate(argv) {
  const opts      = { json: argv.json, quiet: argv.quiet };
  const dir       = resolveProjectDir(argv.project);
  const name      = argv.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  const content   = argv.content;
  const description = argv.description ?? '';

  let projectData;
  try {
    projectData = await load(dir);
  } catch (err) {
    handleLoadError(err, dir, opts);
  }

  // Parse variables
  const vars = listVariables(content);
  const required = requiredVariables(content);

  projectData.templates ??= {};
  projectData.templates[name] = {
    content,
    description,
    variables:   vars,
    required,
    createdAt:   new Date().toISOString(),
  };

  await save(dir, projectData);

  print(`Saved template "${name}" (${vars.length} variable(s), ${required.length} required)`, opts);
  ok({ op: 'template-create', name, vars, required }, opts);
}

/** Handle `template apply <name>` */
async function handleApply(argv) {
  const opts  = { json: argv.json, quiet: argv.quiet };
  const dir   = resolveProjectDir(argv.project);
  const name  = argv.name;
  const clipId = argv.clipId;

  let projectData;
  try {
    projectData = await load(dir);
  } catch (err) {
    handleLoadError(err, dir, opts);
  }

  const template = projectData.templates?.[name];
  if (!template) {
    error(Errors.TEMPLATE_NOT_FOUND, `Template "${name}" not found`, opts);
  }

  // Parse --var flags
  const varValues = parseVarFlags(argv.var ?? []);

  // Build context: project metadata + CLI vars + env
  const ctx = buildContext(projectData, varValues);

  // Validate required variables
  const { validateOrThrow: validateOrThrowFn } = await import('../template/validator.js');
  try {
    validateOrThrowFn(template.content, ctx, { templateName: name });
  } catch (err) {
    if (err.code === 'MISSING_VARIABLE') {
      error(Errors.MISSING_VARIABLE, err.message, opts);
      return;
    }
    throw err;
  }

  // Render
  const { result } = renderContent(template.content, ctx);

  if (clipId) {
    // Update existing clip
    const { TimelineModel } = await import('../core/timeline-model.js');
    const model = new TimelineModel(projectData.timeline);
    const textClips = model._data.text;
    const idx = textClips.findIndex((c) => c.id === clipId);

    if (idx === -1) {
      error(Errors.CLIP_NOT_FOUND, `Text clip '${clipId}' not found`, opts);
      return;
    }

    textClips[idx] = { ...textClips[idx], content: result };
    projectData.timeline = model.toJSON();
    await save(dir, projectData);

    print(`Updated clip ${clipId} with template "${name}"`, opts);
    ok({ op: 'template-apply', template: name, clipId, content: result }, opts);
  } else {
    // Create a new text clip
    const { TimelineModel } = await import('../core/timeline-model.js');
    const model = new TimelineModel(projectData.timeline);

    const { id } = model.addClip({
      type:      'text',
      start:     argv.start ?? 0,
      duration:  argv.duration ?? 3,
      content:   result,
    });

    projectData.timeline = model.toJSON();
    await save(dir, projectData);

    print(`Created text clip ${id} from template "${name}"`, opts);
    ok({ op: 'template-apply', template: name, clipId: id, content: result }, opts);
  }
}

/** Handle `template show <name>` */
async function handleShow(argv) {
  const opts = { json: argv.json, quiet: argv.quiet };
  const dir  = resolveProjectDir(argv.project);

  let projectData;
  try {
    projectData = await load(dir);
  } catch (err) {
    handleLoadError(err, dir, opts);
  }

  const template = projectData.templates?.[argv.name];
  if (!template) {
    error(Errors.TEMPLATE_NOT_FOUND, `Template "${argv.name}" not found`, opts);
  }

  if (opts.json) {
    print({ type: 'template', name: argv.name, .../** @type {any} */ (template) }, opts);
    return;
  }

  const tpl = /** @type {any} */ (template);
  print(`\n  Template: ${argv.name}`, opts);
  if (tpl.description) print(`  Description: ${tpl.description}`, opts);
  print('  ' + '─'.repeat(60), opts);
  print('  Content:', opts);
  print(`    ${tpl.content}`, opts);
  if (tpl.variables?.length > 0) {
    print(`\n  Variables: ${tpl.variables.join(', ')}`, opts);
  }
  if (tpl.required?.length > 0) {
    print(`  Required: ${tpl.required.join(', ')}`, opts);
  }
  print(`  Created: ${tpl.createdAt ?? 'unknown'}`, opts);
  print('', opts);
}

/** Handle `template remove <name>` */
async function handleRemove(argv) {
  const opts = { json: argv.json, quiet: argv.quiet };
  const dir  = resolveProjectDir(argv.project);

  let projectData;
  try {
    projectData = await load(dir);
  } catch (err) {
    handleLoadError(err, dir, opts);
  }

  if (!projectData.templates?.[argv.name]) {
    error(Errors.TEMPLATE_NOT_FOUND, `Template "${argv.name}" not found`, opts);
  }

  delete projectData.templates[argv.name];
  await save(dir, projectData);

  print(`Removed template "${argv.name}"`, opts);
  ok({ op: 'template-remove', name: argv.name }, opts);
}

/** Handle `template render <name>` */
async function handleRender(argv) {
  const opts = { json: argv.json, quiet: argv.quiet };
  const dir  = resolveProjectDir(argv.project);

  let projectData;
  try {
    projectData = await load(dir);
  } catch (err) {
    handleLoadError(err, dir, opts);
  }

  const template = projectData.templates?.[argv.name];
  if (!template) {
    error(Errors.TEMPLATE_NOT_FOUND, `Template "${argv.name}" not found`, opts);
  }

  const varValues = parseVarFlags(argv.var ?? []);
  const ctx       = buildContext(projectData, varValues);

  const { result, missing } = renderContent(/** @type {string} */ (template.content), ctx);

  if (opts.json) {
    print({
      type:    'template-render',
      name:    argv.name,
      result,
      missing,
      context: ctx,
    }, opts);
    return;
  }

  print(`\n  Template: ${argv.name}`, opts);
  print('  ' + '─'.repeat(60), opts);
  print('  Variables used:', opts);
  for (const [k, v] of Object.entries(ctx)) {
    if (k.startsWith('ENV.')) continue;
    print(`    ${k} = ${JSON.stringify(v)}`, opts);
  }
  print('\n  Rendered output:', opts);
  print(`    ${result}`, opts);
  if (missing.length > 0) {
    print(`\n  ⚠ Unresolved variables: ${missing.join(', ')}`, opts);
  }
  print('', opts);
}

/** Handle `template vars <name>` */
async function handleVars(argv) {
  const opts = { json: argv.json, quiet: argv.quiet };
  const dir  = resolveProjectDir(argv.project);

  let projectData;
  try {
    projectData = await load(dir);
  } catch (err) {
    handleLoadError(err, dir, opts);
  }

  const template = projectData.templates?.[argv.name];
  if (!template) {
    error(Errors.TEMPLATE_NOT_FOUND, `Template "${argv.name}" not found`, opts);
  }

  const tpl = /** @type {any} */ (template);
  const vars = listVariables(tpl.content);

  if (opts.json) {
    print({ type: 'template-vars', name: argv.name, variables: vars }, opts);
    return;
  }

  print(`\n  Variables in template "${argv.name}":`, opts);
  for (const v of vars) {
    const isRequired = !v.endsWith('?');
    print(`    ${v} ${isRequired ? '(required)' : '(optional)'}`, opts);
  }
  print('', opts);
  print(`  Total: ${vars.length} variable(s)`, opts);
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

/**
 * Map project load errors to user-friendly output.
 *
 * @param {Error} err
 * @param {string} dir
 * @param {{ json?: boolean, quiet?: boolean }} opts
 * @returns {never}
 */
function handleLoadError(err, dir, opts) {
  if (err.code === 'PROJECT_NOT_FOUND') {
    error(Errors.PROJECT_NOT_FOUND, `No project found at ${dir}.  Run \`ffclaw new\` first.`, opts);
  }
  if (err.code === 'INVALID_PROJECT') {
    error(Errors.INVALID_PROJECT, err.message, opts);
  }
  throw err;
}

/**
 * Parse --var flags into a key-value object.
 *
 * @param {string[]} flags  e.g. ['title=Hello', 'author=World']
 * @returns {Record<string, string>}
 */
function parseVarFlags(flags) {
  /** @type {Record<string, string>} */
  const vars = {};
  for (const flag of flags) {
    const idx = flag.indexOf('=');
    if (idx === -1) continue;
    const k = flag.slice(0, idx).trim();
    const v = flag.slice(idx + 1).trim();
    if (k) vars[k] = v;
  }
  return vars;
}

/**
 * Build the rendering context from project metadata + CLI vars.
 *
 * @param {import('../core/project.js').ProjectData} projectData
 * @param {Record<string, string>} varValues
 * @returns {Record<string, any>}
 */
function buildContext(projectData, varValues) {
  return {
    // Project metadata
    project: {
      title:   projectData.title   ?? 'Untitled',
      author:  projectData.author  ?? process.env.USER ?? 'Anonymous',
      date:    new Date().toISOString().slice(0, 10),
      year:    String(new Date().getFullYear()),
      time:    new Date().toISOString().slice(11, 19),
      version: '1.0',
      ...projectData,
    },
    // CLI --var values
    ...varValues,
    // Env vars accessible as ENV.VARNAME
    ...Object.fromEntries(
      Object.entries(process.env).map(([k, v]) => [`ENV.${k}`, v ?? '']),
    ),
  };
}
