/**
 * Batch rendering queue for GL Transitions.
 *
 * Renders all 121 GL Transitions as sample videos for validation.
 */

import { GLTransitionRenderer } from './gl-renderer.js';
import { listGLTransitions } from './registry.js';
import { validateParams } from './params.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';

/**
 * Render all 121 transitions as sample videos.
 *
 * Each sample video is 5 seconds:
 *   - 0-2s: from image only (static)
 *   - 2-3s: transition (1 second at given duration)
 *   - 3-5s: to image only (static)
 *
 * @param {string} inputFrom   - Path to the 'from' image or video
 * @param {string} inputTo     - Path to the 'to' image or video
 * @param {string} outputDir   - Directory to write sample videos
 * @param {{ fps?: number, width?: number, height?: number, duration?: number }} opts
 */
export async function renderAllSamples(inputFrom, inputTo, outputDir, {
  fps = 30,
  width = 1024,
  height = 1024,
  duration = 1.0,
  fromDuration = 2.0,
  toDuration = 2.0,
} = {}) {
  const transitions = listGLTransitions();
  const results = [];

  console.error(`[Queue] Rendering ${transitions.length} transitions to ${outputDir}`);
  console.error(`[Queue] Settings: ${width}x${height} @ ${fps}fps, transition=${duration}s, from=${fromDuration}s, to=${toDuration}s`);

  await fs.mkdir(outputDir, { recursive: true });

  const renderer = new GLTransitionRenderer({ width, height, fps });

  for (const t of transitions) {
    const outPath = path.join(outputDir, `sample-${t.name}.mp4`);

    // Build default params from schema
    const userParams = {};
    if (t.params && t.params.length > 0) {
      for (const p of t.params) {
        userParams[p.name] = p.default;
      }
    }

    process.stderr.write(`[${results.length + 1}/${transitions.length}] ${t.name}... `);

    const start = Date.now();
    try {
      await renderer.render(inputFrom, inputTo, t.name, duration, outPath, userParams, {
        fromDuration,
        toDuration,
      });
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      process.stderr.write(`✓ (${elapsed}s)\n`);
      results.push({ name: t.name, status: 'ok', path: outPath });
    } catch (err) {
      process.stderr.write(`✗ ERROR: ${err.message.split('\n')[0]}\n`);
      results.push({ name: t.name, status: 'error', error: err.message });
    }
  }

  renderer.dispose();

  const ok = results.filter(r => r.status === 'ok').length;
  const fail = results.filter(r => r.status === 'error').length;
  console.error(`\n[Queue] Done: ${ok} ok, ${fail} failed`);

  return results;
}

/**
 * Render a single transition sample (convenience function).
 */
export async function renderSample(fromPath, toPath, transitionName, outputPath, opts = {}) {
  const {
    width = 1024,
    height = 1024,
    fps = 30,
    duration = 1.0,
    fromDuration = 2.0,
    toDuration = 2.0,
    params = {},
  } = opts;

  const renderer = new GLTransitionRenderer({ width, height, fps });
  try {
    await renderer.render(fromPath, toPath, transitionName, duration, outputPath, params, {
      fromDuration,
      toDuration,
    });
  } finally {
    renderer.dispose();
  }
}
