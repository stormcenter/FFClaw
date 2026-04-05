#!/usr/bin/env node
/**
 * FFClaw CLI entry point.
 * Routes sub-commands via yargs and passes global flags to every handler.
 */

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import newCmd from '../src/commands/new.js';
import importCmd from '../src/commands/import.js';
import timelineCmd from '../src/commands/timeline.js';
import filterCmd from '../src/commands/filter.js';
import textCmd from '../src/commands/text.js';
import templateCmd from '../src/commands/template.js';
import previewCmd from '../src/commands/preview.js';
import queueCmd from '../src/commands/queue.js';
import exportCmd from '../src/commands/export.js';
import transitionCmd from '../src/commands/transition.js';

yargs(hideBin(process.argv))
  .scriptName('ffclaw')
  .usage('$0 <command> [options]')
  // ── Global options ──────────────────────────────────────────────────────────
  .option('project', {
    alias: 'p',
    type: 'string',
    description: 'Project directory (default: cwd)',
    default: process.cwd(),
    global: true,
  })
  .option('json', {
    type: 'boolean',
    description: 'Machine-readable JSON output',
    default: false,
    global: true,
  })
  .option('quiet', {
    alias: 'q',
    type: 'boolean',
    description: 'Suppress non-error output',
    default: false,
    global: true,
  })
  .option('ffmpeg', {
    type: 'string',
    description: 'Path to ffmpeg binary',
    global: true,
  })
  // ── Sub-commands ─────────────────────────────────────────────────────────────
  .command(newCmd)
  .command(importCmd)
  .command(timelineCmd)
  .command(filterCmd)
  .command(textCmd)
  .command(templateCmd)
  .command(previewCmd)
  .command(queueCmd)
  .command(exportCmd)
  .command(transitionCmd)
  // ── Defaults ─────────────────────────────────────────────────────────────────
  .demandCommand(1, 'Please specify a command.')
  .recommendCommands()
  .strict()
  .help('help')
  .alias('h', 'help')
  .version()
  .alias('v', 'version')
  .wrap(Math.min(100, process.stdout.columns || 100))
  .parse();
