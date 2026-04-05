#!/usr/bin/env node
/**
 * generate-transition-previews.js
 *
 * Renders all 121 GL transitions as GIF previews using WebGL (via `gl` package)
 * and ffmpeg for GIF encoding.
 *
 * GLSL sources: gl-transitions npm package (in vendor/FFCreator/node_modules)
 * WebGL renderer: `gl` package (headless WebGL)
 *
 * Usage: node scripts/generate-transition-previews.js [--force]
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const VENDOR_FFCREATOR = join(ROOT, 'vendor', 'FFCreator', 'node_modules');
const OUTPUT_DIR = join(ROOT, 'docs', 'transition-previews');

// Load gl-transitions and gl from FF Creator's vendor dependencies
const allTransitions = (await import(join(VENDOR_FFCREATOR, 'gl-transitions', 'index.js'))).default;
const createGL = (await import(join(VENDOR_FFCREATOR, 'gl', 'index.js'))).default;

const W = 320, H = 180, FRAMES = 10, FPS = 8;

const VERT = `#ifdef GL_ES
precision highp float;
#endif
attribute vec2 a_position;
varying vec2 v_texCoord;
void main() {
  v_texCoord = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

/**
 * Auto-fix GLSL source to be compatible with WebGL 1.0 / GLSL ES 1.00.
 *
 * Handles these common incompatibilities found in gl-transitions shaders:
 * 1. Strips `#version 300 es` / `#version 100` directives
 * 2. Replaces `in vec2 uv` (WebGL 2.0 function param) with `vec2 uv`
 * 3. Removes `out vec4 fragColor;` declaration (fragColor written via gl_FragColor)
 * 4. Replaces `textureLod()` with `texture2D()` (WebGL 1.0 equivalent)
 * 5. Conditionally adds `rand`/`random` helpers only if not already defined
 */
function fixShader(source) {
  const hasRand     = /\bfloat\s+rand\s*\(/.test(source);
  const hasRandom   = /\bfloat\s+random\s*\(/.test(source);

  let helpers = '';
  if (!hasRand)   helpers += '\nfloat rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }';
  if (!hasRandom) helpers += '\nfloat random(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }';

  return source
    // Strip version directives (#version 300 es, #version 100, etc.)
    .replace(/^#version\s+.*$/gm, '')
    // Replace "in vec2 uv" (WebGL 2.0 function param qualifier) with "vec2 uv"
    .replace(/\bin\b(\s*)vec2(\s+uv\b)/g, 'vec2$2')
    // Remove standalone "out vec4 fragColor;" declaration
    .replace(/^out\s+vec4\s+fragColor\s*;?\s*$/gm, '')
    // Replace "out vec4 fragColor" in main() body with nothing
    .replace(/out\s+vec4\s+fragColor\s*;?/g, '')
    // Replace textureLod() with texture2D() (WebGL 1.0 equivalent)
    .replace(/textureLod\s*\(/g, 'texture2D(')
    + helpers;
}

function fixShader(source) {
  let s = source;

  // Strip #version directives (may conflict with preamble)
  s = s.replace(/^#version.*$/mg, '');

  // Replace WebGL 2.0 "in"/"out" at global level with nothing or varying
  // Handle: out vec4 fragColor; -> remove (we use gl_FragColor)
  s = s.replace(/^\s*out\s+vec4\s+fragColor\s*;\s*$/m, '');
  // Handle: out vec2 v_texCoord; -> remove duplicate varying decls
  s = s.replace(/^\s*out\s+vec2\s+v_texCoord\s*;\s*$/m, '');

  // Replace "in vec2 uv" parameter-style in function signatures with nothing
  // These are WebGL 2.0 function param qualifiers - strip them
  s = s.replace(/\bin\s+(vec[234]|float|int|uint)\b/g, '$1');

  // Replace global "in" declarations (not in function params)  
  s = s.replace(/^\s*in\s+(vec[234]|float|int)\s+\w+\s*;\s*$/gm, '');

  // Handle vec4() constructors that may use float args in arrays
  // e.g., vec4(color.rgb, 1.0) - this is valid in GLSL 1.00

  // Add common helper functions that some shaders call but don't define
  // Check if shader uses but doesn't define these functions, add them if missing
  const helpers = [
    // Random helpers some transitions use
    'float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'float rand(vec2 co) { return fract(sin(dot(co.xy, vec2(12.9898,78.233))) * 43758.5453); }',
    'float random(vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453); }',
  ];
  
  // Add helpers only if shader uses them without defining
  for (const h of helpers) {
    const fnName = h.match(/float\s+(\w+)/)[1];
    if (s.includes(fnName + '(') && !s.includes('float ' + fnName + '(')) {
      s = h + '\n' + s;
    }
  }

  // Fix precision for samplers - some shaders assume default float precision
  // Add precision qualifiers where missing
  if (!s.includes('precision highp float')) {
    s = '#ifdef GL_ES\nprecision highp float;\n#endif\n' + s;
  }

  return s;
}

function buildFrag(glsl) {
  const fixed = fixShader(glsl);
  return `#ifdef GL_ES
precision highp float;
#endif
#define prog progress
varying vec2 v_texCoord;
uniform float progress;
uniform float ratio;
uniform sampler2D from;
uniform sampler2D to;
uniform float time;
uniform vec4 fromColor;
uniform vec4 toColor;
vec4 getFromColor(vec2 p) { return texture2D(from, p); }
vec4 getToColor(vec2 p) { return texture2D(to, p); }
${fixShader(glsl)}
void main() {
  gl_FragColor = transition(v_texCoord);
}`;
}

function compileShader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error('Shader error: ' + gl.getShaderInfoLog(s));
  }
  return s;
}

function createProgram(gl, vert, frag) {
  const p = gl.createProgram();
  gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER, vert));
  gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error('Link error: ' + gl.getProgramInfoLog(p));
  }
  return p;
}

function createSolidTex(gl, r, g, b) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  const d = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) { d[i*4]=r; d[i*4+1]=g; d[i*4+2]=b; d[i*4+3]=255; }
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, d);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

function createGradTex(gl) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  const d = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    d[i]   = (x / W * 255) | 0;
    d[i+1] = (y / H * 255) | 0;
    d[i+2] = 128;
    d[i+3] = 255;
  }
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, d);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

function writePPM(f, w, h, buf) {
  const hdr = Buffer.from('P6\n' + w + '\n' + h + '\n255\n', 'ascii');
  const rgb = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    rgb[i*3]   = buf[i*4];
    rgb[i*3+1] = buf[i*4+1];
    rgb[i*3+2] = buf[i*4+2];
  }
  writeFileSync(f, Buffer.concat([hdr, rgb]));
}

function getPixels(gl) {
  const b = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, b);
  const flipped = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) flipped.set(b.subarray((H-1-y)*W*4, (H-y)*W*4), y*W*4);
  return flipped;
}

function makeGIF(name) {
  const inputPattern = join(OUTPUT_DIR, '__' + name + '_%d.ppm');
  const outFile = join(OUTPUT_DIR, name + '.gif');
  const filter = 'fps=' + FPS + ',scale=320:-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3';
  try {
    // execFileSync(file, args, options) — correct API for binary + args
    execFileSync('ffmpeg', [
      '-y',
      '-framerate', String(FPS),
      '-i', inputPattern,
      '-vf', filter,
      '-loop', '0',
      outFile
    ], { stdio: 'ignore' });
    return true;
  } catch (err) {
    // ffmpeg may exit with code 1 even when GIF was created (no TTY)
    return existsSync(outFile);
  }
}

async function renderTransition(name, glsl) {
  let gl;
  try {
    gl = createGL(W, H, { preserveDrawingBuffer: true, premultipliedAlpha: false });
    const prog = createProgram(gl, VERT, buildFrag(glsl));

    const vbuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(prog, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const fromTex = createSolidTex(gl, 30, 80, 200);
    const toTex   = createGradTex(gl);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fromTex);
    gl.uniform1i(gl.getUniformLocation(prog, 'from'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, toTex);
    gl.uniform1i(gl.getUniformLocation(prog, 'to'), 1);

    const uProg = gl.getUniformLocation(prog, 'progress');
    const uRatio = gl.getUniformLocation(prog, 'ratio');
    gl.uniform1f(uRatio, W / H);
    gl.uniform1f(gl.getUniformLocation(prog, 'time'), 0);
    gl.uniform4f(gl.getUniformLocation(prog, 'fromColor'), 0, 0, 0, 1);
    gl.uniform4f(gl.getUniformLocation(prog, 'toColor'), 0, 0, 0, 1);

    gl.viewport(0, 0, W, H);
    gl.useProgram(prog);

    for (let i = 0; i < FRAMES; i++) {
      const p = i / (FRAMES - 1);
      gl.uniform1f(uProg, p);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      const pix = getPixels(gl);
      writePPM(join(OUTPUT_DIR, '__' + name + '_' + i + '.ppm'), W, H, pix);
    }

    const gifOk = makeGIF(name);

    // cleanup PPM files
    for (let i = 0; i < FRAMES; i++) {
      try { unlinkSync(join(OUTPUT_DIR, '__' + name + '_' + i + '.ppm')); } catch {}
    }

    return { success: gifOk };
  } catch (err) {
    return { success: false, error: (err.message || String(err)).split('\n')[0] };
  } finally {
    if (gl) {
      const ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────
const force = process.argv.includes('--force');
mkdirSync(OUTPUT_DIR, { recursive: true });

// Build list from gl-transitions package
const transitions = (allTransitions.default || allTransitions).filter(t => t && t.name && t.glsl);
console.log('Rendering ' + transitions.length + ' GL transitions...');

const results = { success: 0, failed: 0, skipped: 0 };

for (const t of transitions) {
  const name = t.name;
  const outFile = join(OUTPUT_DIR, name + '.gif');

  if (!force && existsSync(outFile)) {
    results.skipped++;
    process.stdout.write('\r  [SKIP] ' + name);
    continue;
  }

  process.stdout.write('\r  Rendering ' + name + '...');
  const r = await renderTransition(name, t.glsl);
  if (r.success) {
    results.success++;
    process.stdout.write('\r  [ OK ] ' + name + '\n');
  } else {
    results.failed++;
    process.stdout.write('\r  [FAIL] ' + name + ': ' + r.error + '\n');
  }
}

console.log('\nDone: ' + results.success + ' succeeded, ' + results.failed + ' failed, ' + results.skipped + ' skipped');
