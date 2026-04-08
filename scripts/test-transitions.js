#!/usr/bin/env node
/**
 * Quick diagnostic: test all 121 transitions for GLSL compilation errors
 * using the `gl` package (WebGL 1.0 / GLSL ES 1.00).
 */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = join(new URL('.', import.meta.url).pathname, '..');
const VENDOR_FFCREATOR = join(__dirname, 'vendor', 'FFCreator', 'node_modules');
const allTransitions = (await import(join(VENDOR_FFCREATOR, 'gl-transitions', 'index.js'))).default;
const createGL = (await import(join(VENDOR_FFCREATOR, 'gl', 'index.js'))).default;

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
    return { ok: false, log: gl.getShaderInfoLog(s) };
  }
  return { ok: true };
}

const transitions = allTransitions.filter(t => t && t.name && t.glsl);
console.log(`Testing ${transitions.length} transitions...\n`);

const results = [];
for (const t of transitions) {
  let gl;
  try {
    gl = createGL(64, 64, { preserveDrawingBuffer: false });
    const frag = buildFrag(t.glsl);
    const r = compileShader(gl, gl.FRAGMENT_SHADER, frag);
    if (!r.ok) {
      results.push({ name: t.name, ok: false, error: r.log.split('\n').slice(0, 3).join(' | ') });
    } else {
      results.push({ name: t.name, ok: true });
    }
  } catch (err) {
    results.push({ name: t.name, ok: false, error: err.message.split('\n')[0] });
  } finally {
    if (gl) { try { gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch {} }
  }
}

const ok = results.filter(r => r.ok);
const fail = results.filter(r => !r.ok);
console.log(`OK: ${ok.length}  FAIL: ${fail.length}\n`);
console.log('=== FAILING ===');
for (const r of fail) {
  console.log(`${r.name}: ${r.error}`);
}
