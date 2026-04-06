#!/usr/bin/env node
/**
 * FFClaw Transition CLI
 * Renders GL Transitions between video clips or images.
 */

import { GLTransitionRenderer } from '../src/transitions/gl-renderer.js';
import { getGLTransition, listGLTransitions } from '../src/transitions/registry.js';
import { validateParams } from '../src/transitions/params.js';
import { parseArgs } from 'node:util';
import path from 'node:path';
import fs from 'node:fs/promises';

const TRANSITIONS = listGLTransitions();

function printHelp() {
  console.log(`
FFClaw GL Transition CLI

Usage:
  ffclaw transition list                          List all 121 transitions
  ffclaw transition preview <name> [options]     Preview a single transition (fast, 1 frame)
  ffclaw transition render <name> [options]      Render full transition video
  ffclaw transition sample <name> [options]      Render a sample GIF preview

Options:
  --from, -f          Source file (video or image)   [required]
  --to, -t            Target file (video or image)   [required]
  --duration, -d      Transition duration in seconds  [default: 1.0]
  --output, -o        Output file path               [required]
  --width             Output width                   [default: 1920]
  --height            Output height                  [default: 1080]
  --fps               Frames per second               [default: 30]
  --params            JSON params object              [optional]
  --gif               Output as GIF (preview only)   [default: false]
  --list-params       Show params for a transition  [optional]
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    return;
  }

  const subcommand = args[0];

  if (subcommand === 'list') {
    console.log(`\n121 GL Transitions available:\n`);
    for (const t of TRANSITIONS) {
      const paramsStr = t.params && t.params.length > 0
        ? ` [${t.params.map(p => `${p.name}:${p.type}=${JSON.stringify(p.default)}`).join(', ')}]`
        : '';
      console.log(`  ${t.name.padEnd(28)} — ${t.displayName?.en || t.name}${paramsStr}`);
    }
    console.log(`\n${TRANSITIONS.length} transitions total.`);
    return;
  }

  if (subcommand === 'list-params') {
    const name = args[1];
    if (!name) { console.error('Usage: ffclaw transition list-params <name>'); process.exit(1); }
    const td = getGLTransition(name);
    if (!td) { console.error(`Unknown transition: ${name}`); process.exit(1); }
    console.log(`\nTransition: ${td.name} (${td.displayName?.en || ''})`);
    if (!td.params || td.params.length === 0) {
      console.log('  No parameters.');
    } else {
      console.log('  Parameters:');
      for (const p of td.params) {
        console.log(`    ${p.name}: ${p.type} = ${JSON.stringify(p.default)}`);
      }
    }
    console.log();
    return;
  }

  if (subcommand === 'preview' || subcommand === 'render' || subcommand === 'sample') {
    const name = args[1];
    if (!name) {
      console.error(`Error: transition name required.`);
      console.error(`Run: ffclaw transition list  to see all 121 transitions.`);
      process.exit(1);
    }

    const td = getGLTransition(name);
    if (!td) {
      console.error(`Error: Unknown transition '${name}'.`);
      console.error(`Run: ffclaw transition list  to see all 121 transitions.`);
      process.exit(1);
    }

    // Parse args
    const parsed = parseArgs({
      args: args.slice(2),
      options: {
        from: { short: 'f', type: 'string' },
        to: { short: 't', type: 'string' },
        duration: { short: 'd', type: 'string' },
        output: { short: 'o', type: 'string' },
        width: { type: 'string' },
        height: { type: 'string' },
        fps: { type: 'string' },
        params: { type: 'string' },
        gif: { type: 'boolean' },
        'from-duration': { type: 'string' },
        'to-duration': { type: 'string' },
      },
      allowPositionals: false,
    });

    const fromPath = parsed.values.from;
    const toPath = parsed.values.to;
    const outputPath = parsed.values.output;
    const duration = parsed.values.duration ? parseFloat(parsed.values.duration) : 1.0;
    const width = parsed.values.width ? parseInt(parsed.values.width) : 1920;
    const height = parsed.values.height ? parseInt(parsed.values.height) : 1080;
    const fps = parsed.values.fps ? parseInt(parsed.values.fps) : 30;
    const asGif = parsed.values.gif || false;
    const isSample = subcommand === 'sample';
    const fromDuration = parsed.values['from-duration'] ? parseFloat(parsed.values['from-duration']) : 2.0;
    const toDuration = parsed.values['to-duration'] ? parseFloat(parsed.values['to-duration']) : 2.0;

    if (!fromPath) { console.error('Error: --from/-f required'); process.exit(1); }
    if (!toPath) { console.error('Error: --to/-t required'); process.exit(1); }
    if (!outputPath) { console.error('Error: --output/-o required'); process.exit(1); }

    let userParams = {};
    if (parsed.values.params) {
      try {
        userParams = JSON.parse(parsed.values.params);
      } catch {
        console.error(`Error: Invalid JSON in --params: ${parsed.values.params}`);
        process.exit(1);
      }
    }

    // Validate params
    const schema = td.params || [];
    const errors = validateParams(userParams, schema);
    if (errors.length > 0) {
      console.error(`Error: Invalid params — ${errors.join('; ')}`);
      process.exit(1);
    }

    console.error(`\nFFClaw GL Transition`);
    console.error(`  Transition : ${td.name} (${td.displayName?.en || ''})`);
    console.error(`  From      : ${fromPath}`);
    console.error(`  To        : ${toPath}`);
    console.error(`  Duration  : ${duration}s`);
    console.error(`  Resolution: ${width}x${height}`);
    console.error(`  FPS       : ${fps}`);
    console.error(`  Output    : ${outputPath}`);
    if (Object.keys(userParams).length > 0) {
      console.error(`  Params    : ${JSON.stringify(userParams)}`);
    }
    console.error('');

    const renderer = new GLTransitionRenderer({ width, height, fps });

    if (subcommand === 'preview' || isSample) {
      // Fast preview: render a single frame at progress=0.5
      const progress = 0.5;
      console.error(`[Preview] Rendering frame at progress=${progress}...`);
      try {
        const buf = await renderer.renderFrame(fromPath, toPath, td.name, progress, userParams);

        if (asGif) {
          // Convert PNG to GIF using ImageMagick or ffmpeg
          const tmpPng = outputPath.replace(/\.gif$/i, '.png');
          await fs.writeFile(tmpPng, buf);
          try {
            await Deno.run({
              cmd: ['ffmpeg', '-y', '-i', tmpPng,
                    '-vf', 'fps=10,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
                    '-loop', '0', outputPath],
              stdout: 'inherit',
              stderr: 'inherit',
            }).status;
          } catch {
            // If ffmpeg GIF conversion fails, just save PNG
            console.error('GIF conversion skipped, saving PNG instead.');
            await fs.rename(tmpPng, outputPath.replace(/\.gif$/i, '.png'));
          }
        } else {
          await fs.writeFile(outputPath, buf);
          console.error(`[Preview] Saved: ${outputPath} (${buf.length} bytes)`);
        }
      } catch (err) {
        console.error('Preview error:', err.message);
        process.exit(1);
      }
    } else {
      // Full render
      console.error(`[Render] Starting full render...`);
      try {
        await renderer.render(fromPath, toPath, td.name, duration, outputPath, userParams, {
          fromDuration,
          toDuration,
        });
        console.error(`[Render] Complete: ${outputPath}`);
      } catch (err) {
        console.error('Render error:', err.message);
        process.exit(1);
      }
    }

    renderer.dispose();
    return;
  }

  console.error(`Unknown subcommand: ${subcommand}`);
  console.error(`Run: ffclaw transition help`);
  process.exit(1);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
