/**
 * GL Transition Renderer
 *
 * Uses gl-transition (WebGL/GLSL) + FFmpeg to render 121 GL Transitions.
 * No special FFmpeg build required — pure npm packages + stock FFmpeg.
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { pipeline } from 'node:stream/promises';
import createTexture from 'gl-texture2d';
import ndarray from 'ndarray';
import getPixels from 'get-pixels';
import savePixels from 'save-pixels';
import gl from 'gl';
import { GL_TRANSITIONS, getGLTransition } from './registry.js';
import { validateParams, buildEnvString } from './params.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');

// Use createRequire for CJS modules
const require = createRequire(import.meta.url);
const createTransition = require('gl-transition').default;

// Load all transitions from FFCreator's bundled gl-transitions
const GL_TRANSITIONS_DATA = require(
  path.resolve(PROJECT_ROOT, 'vendor/FFCreator/node_modules/gl-transitions/index.js')
);

const DEFAULT_NOISE_TEXTURE = path.resolve(PROJECT_ROOT, 'vendor/gl-transitions/textures/default-noise.png');

/**
 * Find a transition object by kebab-case name.
 * Returns the full gl-transitions entry with glsl, defaultParams, paramsTypes.
 */
function findGLTransition(name) {
  // Try exact kebab-case match first (from our registry)
  const reg = getGLTransition(name);
  if (!reg) return null;

  // The glslFile is the PascalCase/camelCase name used in gl-transitions
  const glslFile = reg.glslFile;
  // Remove .glsl extension for comparison
  const baseName = glslFile.replace(/\.glsl$/i, '');

  // Find in the gl-transitions data array by name field
  // The names in gl-transitions are PascalCase/camelCase
  const t = GL_TRANSITIONS_DATA.find(t => t.name === baseName);
  if (t) return t;

  // Try matching by the name we stored in registry
  // The gl-transitions JSON uses PascalCase names
  // Our registry uses kebab-case
  // Try to find by scanning
  const found = GL_TRANSITIONS_DATA.find(t => {
    const n = t.name.toLowerCase().replace(/([A-Z])/g, '-$1').replace(/^-/, '');
    return n === name || t.name.toLowerCase() === name.toLowerCase();
  });
  return found || null;
}

/**
 * Execute an FFmpeg command.
 * @param {string[]} args
 * @param {{ cwd?: string, env?: object }} opts
 * @returns {Promise<string>}
 */
async function ffmpeg(args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', ['-y', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      ...opts,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => stdout += d);
    child.stderr.on('data', d => stderr += d);
    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(`FFmpeg exited with code ${code}:\n${stderr.slice(-1000)}`));
      } else {
        resolve(stdout);
      }
    });
    child.on('error', reject);
  });
}

/**
 * Extract frames from a video or image to a directory.
 * For images, loops them to fill the requested duration.
 * @param {string} inputPath
 * @param {string} outputDir
 * @param {number} fps
 * @param {{ width?: number, height?: number, duration?: number }} opts
 */
async function extractFrames(inputPath, outputDir, fps, opts = {}) {
  const { width, height, duration } = opts;
  await fs.mkdir(outputDir, { recursive: true });

  const scale = width || height
    ? `scale=${width || -1}:${height || -1}`
    : null;

  // Check if input is a still image (by extension)
  const imageExts = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.gif'];
  const isImage = imageExts.includes(path.extname(inputPath).toLowerCase());

  // Build filter string
  const vf = ['fps=' + fps];
  if (scale) vf.push(scale);

  // Build args:
  // Image with duration: -loop 1 -i <img> -vf <filter> -t <dur> <output>
  // Video:              -i <video> -vf <filter> <output>
  const args = [];
  if (isImage && duration) {
    args.push('-loop', '1');
  }
  args.push('-i', inputPath);
  if (vf.length) args.push('-vf', vf.join(','));
  if (isImage && duration) {
    args.push('-t', String(duration));
  }
  args.push(path.join(outputDir, 'frame_%04d.png'));
  await ffmpeg(args);
}

/**
 * Encode frames from a directory into a video.
 * @param {string} frameDir
 * @param {string} outputPath
 * @param {number} fps
 * @param {number} duration
 */
async function encodeFrames(frameDir, outputPath, fps, duration) {
  const pattern = path.join(frameDir, 'frame_%04d.png');
  const args = [
    '-framerate', String(fps),
    '-i', pattern,
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-t', String(duration),
    '-movflags', '+faststart',
    outputPath,
  ];
  await ffmpeg(args);
}

/**
 * Load an image file as an ndarray (RGBA).
 * @param {string} filePath
 * @returns {Promise<ndarray>}
 */
function loadImageAsNdarray(filePath) {
  return new Promise((resolve, reject) => {
    getPixels(filePath, (err, pixels) => {
      if (err) reject(err);
      else resolve(pixels);
    });
  });
}

/**
 * Save an ndarray as a PNG file.
 * @param {ndarray} arr - shape [height, width, 4]
 * @param {string} outputPath
 */
async function saveNdarrayAsPng(arr, outputPath) {
  // WebGL readPixels gives [height, width, 4] with Y from bottom to top.
  // savePixels expects [height, width, channels].
  // The data is already in the right layout — no transpose needed.
  const strm = savePixels(arr, 'PNG');
  const buf = [];
  strm.on('data', chunk => buf.push(chunk));
  await new Promise((res, rej) => {
    strm.on('end', res);
    strm.on('error', rej);
  });
  await fs.writeFile(outputPath, Buffer.concat(buf));
}

/**
 * GLTransitionRenderer — renders WebGL/GLSL transitions between video clips or images.
 */
export class GLTransitionRenderer {
  /**
   * @param {{ projectDir?: string, width?: number, height?: number, fps?: number }} options
   */
  constructor({ projectDir, width = 1920, height = 1080, fps = 30 } = {}) {
    this.projectDir = projectDir || PROJECT_ROOT;
    this.width = width;
    this.height = height;
    this.fps = fps;

    // Headless WebGL context
    this._gl = gl(width, height, {
      preserveDrawingBuffer: true,
      antialias: false,
      alpha: false,
    });
    if (!this._gl) throw new Error('Failed to create WebGL context (is gl context supported?)');

    this._gl.pixelStorei(this._gl.UNPACK_FLIP_Y_WEBGL, true);

    // Big triangle buffer — required by gl-transition
    this._buf = this._gl.createBuffer();
    this._gl.bindBuffer(this._gl.ARRAY_BUFFER, this._buf);
    this._gl.bufferData(
      this._gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, -1, 4, 4, -1]),
      this._gl.STATIC_DRAW
    );

    // Cache for loaded transition objects
    this._transitionCache = new Map();
  }

  /**
   * Get the WebGL context (for testing).
   */
  get gl() {
    return this._gl;
  }

  /**
   * Render a GL transition between two video/image files.
   *
   * @param {string} fromPath  - Path to the 'from' video or image
   * @param {string} toPath    - Path to the 'to' video or image
   * @param {string} transitionName - kebab-case transition name (e.g. 'cross-zoom')
   * @param {number} duration   - Transition duration in seconds
   * @param {string} outputPath - Output video path
   * @param {object} params    - Optional shader parameters
   * @param {{ fromDuration?: number, toDuration?: number }} opts
   */
  async render(fromPath, toPath, transitionName, duration, outputPath, params = {}, opts = {}) {
    const { fromDuration = 2.0, toDuration = 2.0 } = opts;
    const td = findGLTransition(transitionName);
    if (!td) {
      throw new Error(`Unknown transition: '${transitionName}'. Check registry for 121 supported transitions.`);
    }

    // Validate params
    const schema = Object.entries(td.paramsTypes || {}).map(([name, type]) => ({
      name, type, default: td.defaultParams?.[name]
    }));
    const errors = validateParams(params, schema);
    if (errors.length > 0) {
      throw new Error(`Invalid params: ${errors.join(', ')}`);
    }

    // Resolve sampler2D textures
    const noiseTexPath = DEFAULT_NOISE_TEXTURE;
    const resolvedParams = { ...params };
    for (const param of schema) {
      if (param.type === 'sampler2D') {
        let v = resolvedParams[param.name];
        if (!v || v === '__default_noise__') {
          v = noiseTexPath;
        }
        resolvedParams[param.name] = v;
      }
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `ffclaw-gl-${Date.now()}-`));
    const frames1Dir = path.join(tmpDir, 'frames1');
    const frames2Dir = path.join(tmpDir, 'frames2');
    const outputFramesDir = path.join(tmpDir, 'output');

    try {
      // Step 1: Extract frames from both sources
      // For images, loop them to fill fromDuration/toDuration
      console.error(`[GL] Extracting frames from source 1: ${fromPath}`);
      await extractFrames(fromPath, frames1Dir, this.fps, {
        width: this.width,
        height: this.height,
        duration: fromDuration,
      });

      console.error(`[GL] Extracting frames from source 2: ${toPath}`);
      await extractFrames(toPath, frames2Dir, this.fps, {
        width: this.width,
        height: this.height,
        duration: toDuration,
      });

      // Determine frame counts
      const frames1 = await fs.readdir(frames1Dir);
      const frames2 = await fs.readdir(frames2Dir);
      frames1.sort();
      frames2.sort();
      const count1 = frames1.length;
      const count2 = frames2.length;

      if (count1 === 0 || count2 === 0) {
        throw new Error('No frames extracted — check input files');
      }

      // Step 2: Build the output frame sequence
      // Structure: from-only (before transition) + transition (blended) + to-only (after transition)
      const transitionFrames = Math.round(this.fps * duration);
      // total = before frames + transition frames + after frames
      const totalOutputFrames = count1 + transitionFrames + count2;

      await fs.mkdir(outputFramesDir, { recursive: true });

      console.error(`[GL] Rendering ${transitionFrames} transition frames...`);

      // Pre-load noise texture for sampler2D params
      let noiseNdarray = null;
      const needsNoise = schema.some(p => p.type === 'sampler2D');
      if (needsNoise) {
        noiseNdarray = await loadImageAsNdarray(noiseTexPath);
      }

      // Create the transition
      const transition = this._getOrCreateTransition(td);

      // Render each output frame
      for (let i = 0; i < totalOutputFrames; i++) {
        const frameNum = String(i + 1).padStart(4, '0');
        const outPath = path.join(outputFramesDir, `frame_${frameNum}.png`);

        if (i < count1) {
          // Before transition: copy from source 1
          const srcFrame = frames1[i];
          await fs.copyFile(
            path.join(frames1Dir, srcFrame),
            outPath
          );
        } else if (i < count1 + transitionFrames) {
          // Transition zone: render blended frame
          const tFrameIdx = i - count1;
          const progress = transitionFrames > 0 ? tFrameIdx / transitionFrames : 0;

          // Source frame indices (cycle if needed)
          const src1Idx = Math.min(tFrameIdx, count1 - 1);
          const src2Idx = Math.min(tFrameIdx, count2 - 1);

          const src1Path = path.join(frames1Dir, frames1[src1Idx]);
          const src2Path = path.join(frames2Dir, frames2[src2Idx]);

          await this._renderTransitionFrame(
            transition, td,
            src1Path, src2Path,
            progress,
            outPath,
            resolvedParams,
            schema,
            noiseNdarray
          );
        } else {
          // After transition: copy from source 2
          const src2Idx = Math.min(i - (count1 + transitionFrames), count2 - 1);
          const srcFrame = frames2[src2Idx];
          await fs.copyFile(
            path.join(frames2Dir, srcFrame),
            outPath
          );
        }

        if ((i + 1) % 10 === 0 || i === totalOutputFrames - 1) {
          console.error(`[GL] Frame ${i + 1}/${totalOutputFrames}`);
        }
      }

      // Step 3: Encode to video
      const outputDuration = totalOutputFrames / this.fps;
      console.error(`[GL] Encoding output: ${outputPath}`);
      await encodeFrames(outputFramesDir, outputPath, this.fps, outputDuration);
      console.error(`[GL] Done: ${outputPath}`);

    } finally {
      // Clean up temp dir
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }

  /**
   * Render a single blended frame (for previews / progress frames).
   *
   * @param {string} fromPath
   * @param {string} toPath
   * @param {string} transitionName
   * @param {number} progress - 0.0 to 1.0
   * @param {object} params
   * @returns {Promise<Buffer>} PNG image buffer
   */
  async renderFrame(fromPath, toPath, transitionName, progress, params = {}) {
    const td = findGLTransition(transitionName);
    if (!td) throw new Error(`Unknown transition: '${transitionName}'`);

    const schema = Object.entries(td.paramsTypes || {}).map(([name, type]) => ({
      name, type, default: td.defaultParams?.[name]
    }));

    // Load noise texture if needed
    let noiseNdarray = null;
    if (schema.some(p => p.type === 'sampler2D')) {
      noiseNdarray = await loadImageAsNdarray(DEFAULT_NOISE_TEXTURE);
    }

    // Resolve sampler2D params
    const resolvedParams = { ...params };
    for (const param of schema) {
      if (param.type === 'sampler2D') {
        let v = resolvedParams[param.name];
        if (!v || v === '__default_noise__') v = DEFAULT_NOISE_TEXTURE;
        resolvedParams[param.name] = v;
      }
    }

    const tmpFile = path.join(os.tmpdir(), `ffclaw-frame-${Date.now()}.png`);
    try {
      await this._renderTransitionFrame(
        this._getOrCreateTransition(td),
        td,
        fromPath, toPath,
        progress,
        tmpFile,
        resolvedParams,
        schema,
        noiseNdarray
      );
      return await fs.readFile(tmpFile);
    } finally {
      await fs.rm(tmpFile, { force: true });
    }
  }

  /**
   * Internal: render one transition frame.
   */
  async _renderTransitionFrame(transition, td, fromPath, toPath, progress, outPath, params, schema, noiseNdarray) {
    const glctx = this._gl;

    // Load source images as ndarrays
    const [fromNd, toNd] = await Promise.all([
      loadImageAsNdarray(fromPath),
      loadImageAsNdarray(toPath),
    ]);

    // Create WebGL textures
    const texFrom = createTexture(glctx, fromNd);
    const texTo = createTexture(glctx, toNd);
    texFrom.minFilter = glctx.LINEAR;
    texFrom.magFilter = glctx.LINEAR;
    texTo.minFilter = glctx.LINEAR;
    texTo.magFilter = glctx.LINEAR;

    // Prepare texture uniforms for sampler2D params
    const textureUniforms = {};
    let textureUnit = 2; // 0 = from, 1 = to, start at 2
    for (const [name, type] of Object.entries(td.paramsTypes || {})) {
      if (type === 'sampler2D') {
        const texPath = params[name] || DEFAULT_NOISE_TEXTURE;
        let texNd;
        if (texPath === DEFAULT_NOISE_TEXTURE && noiseNdarray) {
          texNd = noiseNdarray;
        } else {
          texNd = await loadImageAsNdarray(texPath);
        }
        const tex = createTexture(glctx, texNd);
        tex.minFilter = glctx.LINEAR;
        tex.magFilter = glctx.LINEAR;
        textureUniforms[name] = { tex, unit: textureUnit++ };
      }
    }

    // Build the params object for transition.draw()
    const drawParams = {};
    for (const [name, type] of Object.entries(td.paramsTypes || {})) {
      const val = params[name] !== undefined ? params[name] : td.defaultParams?.[name];
      if (type === 'sampler2D') {
        const entry = textureUniforms[name];
        if (entry) drawParams[name] = entry.tex;
      } else {
        drawParams[name] = val;
      }
    }

    // Set viewport and draw
    glctx.viewport(0, 0, this.width, this.height);
    transition.draw(
      progress,
      texFrom,
      texTo,
      this.width,
      this.height,
      drawParams
    );

    // Read pixels back
    const pixelData = new Uint8Array(this.width * this.height * 4);
    glctx.readPixels(0, 0, this.width, this.height, glctx.RGBA, glctx.UNSIGNED_BYTE, pixelData);

    // WebGL readPixels gives data in [height, width, 4] layout (row by row, bottom to top)
    // savePixels expects [height, width, 4] with row-major order — this matches!
    const arr = ndarray(pixelData, [this.height, this.width, 4]);

    await saveNdarrayAsPng(arr, outPath);

    // Dispose textures
    texFrom.dispose();
    texTo.dispose();
    for (const entry of Object.values(textureUniforms)) {
      entry.tex.dispose();
    }
  }

  /**
   * Get or create a cached gl-transition instance.
   */
  _getOrCreateTransition(td) {
    if (this._transitionCache.has(td.name)) {
      return this._transitionCache.get(td.name);
    }
    const t = createTransition(this._gl, td);
    this._transitionCache.set(td.name, t);
    return t;
  }

  dispose() {
    for (const t of this._transitionCache.values()) {
      t.dispose();
    }
    this._transitionCache.clear();
  }
}

export default GLTransitionRenderer;
