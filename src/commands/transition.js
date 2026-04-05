/**
 * `ffclaw transition` — GL Transition browser, info, and preview.
 *
 * Sub-commands:
 *   transition list [--has-params]    List all 121 GL transitions
 *   transition info <name>             Show details of a specific transition
 *   transition preview <name>          Render a sample GIF of the transition
 *
 * @module commands/transition
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

import { GL_TRANSITIONS, listGLTransitions, getGLTransition } from '../transitions/registry.js';
import { buildEnvString } from '../transitions/params.js';
import { print, ok, error, Errors } from '../utils/output.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');

// ── Yargs command definition ──────────────────────────────────────────────────

export const command = 'transition <subcommand>';
export const desc    = 'Browse, inspect, and preview GL Transitions';

export function builder(yargs) {
  return yargs
    // ── transition list ─────────────────────────────────────────────────────
    .command({
      command: 'list',
      desc: 'List all GL transitions (or only those with parameters)',
      builder: (y) =>
        y
          .option('has-params', {
            type: 'boolean',
            description: 'Only show transitions that accept parameters',
            default: false,
          })
          .example('$0 transition list', 'List all 121 GL transitions')
          .example('$0 transition list --has-params', 'Only show transitions with parameters'),
      handler: handleList,
    })
    // ── transition info ─────────────────────────────────────────────────────
    .command({
      command: 'info <name>',
      desc: 'Show detailed information about a specific transition',
      builder: (y) =>
        y
          .positional('name', {
            type: 'string',
            description: 'Transition name (kebab-case, e.g. cross-zoom, water-drop)',
          })
          .example('$0 transition info cross-zoom', 'Show cross-zoom transition details')
          .example('$0 transition info water-drop', 'Show water-drop transition details'),
      handler: handleInfo,
    })
    // ── transition preview ──────────────────────────────────────────────────
    .command({
      command: 'preview <name>',
      desc: 'Render a preview GIF showing the transition effect',
      builder: (y) =>
        y
          .positional('name', {
            type: 'string',
            description: 'Transition name (kebab-case)',
          })
          .option('from', {
            type: 'string',
            description: 'Path to the "from" image (default: generated gradient)',
            default: null,
          })
          .option('to', {
            type: 'string',
            description: 'Path to the "to" image (default: generated gradient)',
            default: null,
          })
          .option('output', {
            alias: 'o',
            type: 'string',
            description: 'Output GIF file path',
            default: null,
          })
          .option('duration', {
            alias: 'd',
            type: 'number',
            description: 'Transition duration in seconds',
            default: 2,
          })
          .option('width', {
            type: 'number',
            description: 'GIF width in pixels',
            default: 320,
          })
          .option('height', {
            type: 'number',
            description: 'GIF height in pixels',
            default: 180,
          })
          .option('frames', {
            type: 'number',
            description: 'Number of frames in the GIF',
            default: 12,
          })
          .example('$0 transition preview cross-zoom', 'Preview cross-zoom with default settings')
          .example('$0 transition preview water-drop -o preview.gif --duration 1', 'Custom output and duration'),
      handler: handlePreview,
    })
    .demandCommand(1, 'Please specify a transition sub-command.')
    .example('$0 transition list', 'List all GL transitions')
    .example('$0 transition info cross-zoom', 'Show cross-zoom details')
    .example('$0 transition preview cross-zoom -o preview.gif', 'Generate preview GIF');
}

export default { command, desc, builder, handler: () => {} };

// ── Sub-command handlers ──────────────────────────────────────────────────────

/** Handle `transition list [--has-params]` */
async function handleList(argv) {
  const opts = { json: argv.json, quiet: argv.quiet };
  const all  = listGLTransitions();

  const transitions = argv['has-params']
    ? all.filter((t) => t.hasParams)
    : all;

  if (opts.json) {
    for (const t of transitions) {
      print({
        type:        'gl-transition',
        name:        t.name,
        displayName: t.displayName?.en ?? t.name,
        zhName:      t.displayName?.zh ?? '',
        hasParams:   t.hasParams,
        paramCount:  t.params?.length ?? 0,
        params:      t.params ?? [],
      }, opts);
    }
    return;
  }

  const label = argv['has-params'] ? 'GL TRANSITIONS (with parameters)' : 'ALL GL TRANSITIONS';
  print(`\n  ${label}`, opts);
  print(`  ${'─'.repeat(70)}`, opts);

  for (const t of transitions) {
    const params = t.params?.length > 0
      ? `  [${t.params.map((p) => `${p.name}:${p.type}`).join(', ')}]`
      : '';
    const name = (t.displayName?.zh ?? t.name).padEnd(20);
    print(`  ${name}  ${t.name}${params}`, opts);
  }

  print(`\n  Total: ${transitions.length} transition(s)`, opts);

  const withParams  = all.filter((t) => t.hasParams).length;
  const noParams    = all.filter((t) => !t.hasParams).length;
  print(`  (All: ${all.length} | With params: ${withParams} | Without params: ${noParams})\n`, opts);
}

/** Handle `transition info <name>` */
async function handleInfo(argv) {
  const opts = { json: argv.json, quiet: argv.quiet };
  const name = argv.name;

  const gl = getGLTransition(name);
  if (!gl) {
    error(Errors.TRANSITION_GLSL_NOT_FOUND.replace('{name}', name),
      `GL Transition '${name}' not found.  Run \`ffclaw transition list\` to see all available transitions.`,
      opts);
  }

  if (opts.json) {
    print({
      type:        'gl-transition-info',
      name:        gl.name,
      displayName: gl.displayName?.en ?? gl.name,
      zhName:      gl.displayName?.zh ?? '',
      glslFile:    gl.glslFile,
      hasParams:   gl.hasParams,
      sampler2D:   gl.sampler2D ?? false,
      params:      gl.params ?? [],
    }, opts);
    return;
  }

  const glslPath = path.resolve(PROJECT_ROOT, 'vendor/gl-transitions', 'transitions', gl.glslFile);
  const exists = await fileExists(glslPath);

  print(`\n  GL TRANSITION: ${gl.name}`, opts);
  print(`  ${'─'.repeat(60)}`, opts);
  print(`  English:   ${gl.displayName?.en ?? '(none)'}`, opts);
  print(`  中文:      ${gl.displayName?.zh ?? '(none)'}`, opts);
  print(`  GLSL file: ${gl.glslFile} ${exists ? '✓' : '(file not found)'}`, opts);
  print(`  Has params: ${gl.hasParams ? 'Yes' : 'No'}`, opts);
  print(`  Sampler2D:  ${gl.sampler2D ? 'Yes (requires texture)' : 'No'}`, opts);

  if (gl.params && gl.params.length > 0) {
    print(`\n  Parameters (${gl.params.length}):`, opts);
    print(`  ${'─'.repeat(60)}`, opts);
    for (const p of gl.params) {
      const def = Array.isArray(p.default) ? `[${p.default.join(', ')}]` : String(p.default);
      print(`    ${p.name.padEnd(24)} ${p.type.padEnd(10)} default: ${def}`, opts);
    }
  } else {
    print(`\n  No parameters.`, opts);
  }

  print('', opts);
}

/** Handle `transition preview <name>` */
async function handlePreview(argv) {
  const opts     = { json: argv.json, quiet: argv.quiet };
  const name     = argv.name;
  const duration = argv.duration ?? 2;
  const width    = argv.width ?? 320;
  const height   = argv.height ?? 180;
  const nFrames  = argv.frames ?? 12;
  const output   = argv.output ?? `preview-${name}.gif`;

  const gl = getGLTransition(name);
  if (!gl) {
    error(Errors.TRANSITION_GLSL_NOT_FOUND.replace('{name}', name),
      `GL Transition '${name}' not found.`,
      opts);
  }

  // Determine from/to images
  let fromImg = argv.from;
  let toImg   = argv.to;

  // If no images provided, create temporary gradient images
  const tmpDir = path.join(PROJECT_ROOT, '.ffclaw-tmp');
  await mkdirp(tmpDir);

  if (!fromImg) {
    fromImg = path.join(tmpDir, `preview-from-${process.pid}.png`);
    await createTestImage(fromImg, width, height, '#4a90e2', '#1a3a6e');
  }
  if (!toImg) {
    toImg = path.join(tmpDir, `preview-to-${process.pid}.png`);
    await createTestImage(toImg, width, height, '#e2a04a', '#6e3a1a');
  }

  const glslPath = path.resolve(PROJECT_ROOT, 'vendor/gl-transitions', 'transitions', gl.glslFile);

  // Check if gltransition filter is available
  const hasGLTransition = await checkGLTransitionFilter();

  if (!opts.quiet) {
    print(`Generating preview for "${name}"…`, opts);
    print(`  From: ${fromImg}`, opts);
    print(`  To:   ${toImg}`, opts);
    print(`  GLSL: ${glslPath}`, opts);
    print(`  Output: ${output}`, opts);
  }

  try {
    if (hasGLTransition) {
      await generatePreviewWithGL(fromImg, toImg, glslPath, gl, duration, nFrames, output, opts);
    } else {
      print('  Note: ffmpeg-gl-transition not available — using crossfade fallback', opts);
      await generatePreviewCrossfade(fromImg, toImg, duration, nFrames, output, opts);
    }

    if (!opts.quiet) {
      print(`\n  Preview saved to: ${output}`, opts);
    }
    ok({ type: 'ok', op: 'preview', name, output, width, height, frames: nFrames, duration }, opts);
  } catch (err) {
    error('PREVIEW_ERROR', `Failed to generate preview: ${err.message}`, opts);
  }
}

// ── Preview generation helpers ────────────────────────────────────────────────

/**
 * Generate a GIF preview using the gltransition filter.
 */
async function generatePreviewWithGL(fromImg, toImg, glslPath, gl, duration, nFrames, output, opts) {
  const fps = nFrames / duration;

  // Build FFmpeg env string
  const defaultNoise = path.resolve(PROJECT_ROOT, 'vendor/gl-transitions', 'textures', 'default-noise.png');
  const envStr = buildEnvString({}, gl.params ?? [], PROJECT_ROOT, defaultNoise);

  // Build gltransition filter string
  const parts = [`duration=${duration}`, `source=${glslPath}`];
  if (envStr) parts.push(`env=${envStr}`);
  const filterStr = `gltransition=${parts.join(':')}`;

  // Build the filter_complex for frame generation
  // We use a "fake" timeline trick: create two short clips and apply gltransition
  const tmpMux = output.replace('.gif', '-mux.mp4');

  const ffmpegCmd = [
    'ffmpeg', '-y',
    '-loop', '1', '-i', fromImg, '-loop', '1', '-i', toImg,
    '-filter_complex',
    `[0:v][1:v]${filterStr}[out]`,
    '-map', '[out]',
    '-t', String(duration),
    '-r', String(fps),
    '-vf', `fps=${fps},scale=${opts.width ?? 320}:-1:flags=lanczos,split[s0][s1];[s0][s1]palettegen=stats_mode=diff`,
    '-pix_fmt', 'rgba',
    tmpMux,
  ];

  try {
    execSync(ffmpegCmd.join(' '), { stdio: 'pipe' });
  } catch (err) {
    // Fallback: try simpler approach without muxing
    print(`  gltransition render failed, trying crossfade fallback…`, opts);
    await generatePreviewCrossfade(fromImg, toImg, duration, nFrames, output, opts);
    return;
  }

  // Convert to GIF
  const gifCmd = [
    'ffmpeg', '-y',
    '-i', tmpMux,
    '-vf', `fps=${fps},scale=${opts.width ?? 320}:-1:flags=lanczos,split[s0][s1];[s0][s1]palettegen=stats_mode=full[pal];[s1][pal]paletteuse=dither=bayer:bayer_scale=5`,
    '-loop', '0',
    output,
  ];

  execSync(gifCmd.join(' '), { stdio: 'pipe' });

  // Clean up temp mux
  try { execSync(`rm -f ${tmpMux}`); } catch {}
}

/**
 * Generate a GIF preview using simple crossfade (fallback when gltransition unavailable).
 * Builds video clips then uses xfade.
 */
async function generatePreviewCrossfade(fromImg, toImg, duration, nFrames, output, opts) {
  const width = opts.width ?? 320;
  const tmpDir = path.dirname(output);
  const clip1  = path.join(tmpDir, `preview-c1-${process.pid}.mp4`);
  const clip2  = path.join(tmpDir, `preview-c2-${process.pid}.mp4`);
  const tmpMux = path.join(tmpDir, `preview-mux-${process.pid}.mp4`);

  const cleanup = () => {
    try { execSync(`rm -f "${clip1}" "${clip2}" "${tmpMux}"`, { stdio: 'pipe' }); } catch {}
  };

  // Build clips
  const ok1 = run(
    `ffmpeg -y -loop 1 -i "${fromImg}" -t ${duration} -r 30 ` +
    `-c:v libx264 -pix_fmt yuv420p -preset ultrafast "${clip1}"`
  );
  if (!ok1) { cleanup(); throw new Error('Failed to create clip 1'); }

  const ok2 = run(
    `ffmpeg -y -loop 1 -i "${toImg}" -t ${duration} -r 30 ` +
    `-c:v libx264 -pix_fmt yuv420p -preset ultrafast "${clip2}"`
  );
  if (!ok2) { cleanup(); throw new Error('Failed to create clip 2'); }

  const fadeDur = Math.min(1, duration / 2);
  const ok3 = run(
    `ffmpeg -y -i "${clip1}" -i "${clip2}" ` +
    `-filter_complex "[0:v][1:v]xfade=transition=fade:duration=${fadeDur}:offset=${duration}[out]" ` +
    `-map "[out]" -r ${nFrames / duration} -c:v libx264 -pix_fmt yuv420p -preset ultrafast "${tmpMux}"`
  );
  if (!ok3) { cleanup(); throw new Error('xfade failed'); }

  // Convert to GIF
  const ok4 = run(
    `ffmpeg -y -i "${tmpMux}" ` +
    `-vf "fps=${nFrames / duration},scale=${width}:-1:flags=lanczos" ` +
    `-loop 0 "${output}"`
  );
  if (!ok4) { cleanup(); throw new Error('GIF conversion failed'); }

  cleanup();
}

// ── Image generation helpers ─────────────────────────────────────────────────

/**
 * Create a simple solid-color test image using Node.js canvas or ImageMagick.
 */
async function createTestImage(outputPath, width, height, color1, color2) {
  // Try using ImageMagick first (convert)
  try {
    // Create a horizontal gradient using ImageMagick
    const cmd = `convert -size ${width}x${height} gradient:"${color1}-${color2}" "${outputPath}"`;
    execSync(cmd, { stdio: 'pipe' });
    return;
  } catch {}

  // Fallback: use canvas via node
  try {
    const { createCanvas } = await import('canvas');
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Draw a gradient
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, color1);
    gradient.addColorStop(1, color2);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const buffer = canvas.toBuffer('image/png');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(outputPath, buffer);
    return;
  } catch {}

  // Last resort: use ffmpeg to create a solid color image
  try {
    execSync(
      `ffmpeg -y -f lavfi -i "color=c=${color1.replace('#', '')}:s=${width}x${height}:d=1" -frames:v 1 "${outputPath}"`,
      { stdio: 'pipe' }
    );
  } catch (err) {
    throw new Error(`Could not create test image. Install ImageMagick or provide --from/--to images.`);
  }
}

/**
 * Check if ffmpeg has the gltransition filter compiled in.
 */
async function checkGLTransitionFilter() {
  try {
    const out = execSync('ffmpeg -hide_banner -filters 2>/dev/null || ffmpeg -filters 2>/dev/null', { encoding: 'utf-8' });
    return out.includes('gltransition');
  } catch {
    return false;
  }
}

/**
 * Run a shell command, returning true on success, false on failure.
 */
function run(cmd) {
  try {
    execSync(cmd, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// ── Shared helpers ───────────────────────────────────────────────────────────

/**
 * Check if a file exists.
 */
async function fileExists(fp) {
  try {
    const { stat } = await import('node:fs/promises');
    await stat(fp);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure a directory exists.
 */
async function mkdirp(dir) {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(dir, { recursive: true });
}
