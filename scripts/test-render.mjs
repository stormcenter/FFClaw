#!/usr/bin/env node
/**
 * Test rendering a few transitions to find actual runtime failures.
 */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';

const __dirname = fileURLToPath(new URL('..', import.meta.url));
const VENDOR = join(__dirname, 'vendor', 'FFCreator', 'node_modules');
const allTransitions = (await import(join(VENDOR, 'gl-transitions', 'index.js'))).default;
const createGL = (await import(join(VENDOR, 'gl', 'index.js'))).default;

const W = 64, H = 64, FRAMES = 3;

const VERT = `#ifdef GL_ES
precision highp float;
#endif
attribute vec2 a_position;
varying vec2 v_texCoord;
void main() {
  v_texCoord = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

function buildFrag(glsl) {
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
${glsl}
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

function getPixels(gl) {
  const b = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, b);
  return b;
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
    const toTex = createSolidTex(gl, 200, 80, 30);
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
      getPixels(gl);
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: (err.message || String(err)).split('\n')[0] };
  } finally {
    if (gl) {
      const ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    }
  }
}

// Test ALL transitions
const transitions = (allTransitions.default || allTransitions).filter(t => t && t.name && t.glsl);
console.log(`Rendering ${transitions.length} transitions (3 frames each)...`);

const results = [];
for (const t of transitions) {
  const r = await renderTransition(t.name, t.glsl);
  if (!r.success) {
    results.push({ name: t.name, error: r.error });
  }
}

console.log(`\nSuccess: ${transitions.length - results.length}  Fail: ${results.length}`);
if (results.length > 0) {
  console.log('\n=== FAILING ===');
  for (const r of results) {
    console.log(`${r.name}: ${r.error}`);
  }
}
