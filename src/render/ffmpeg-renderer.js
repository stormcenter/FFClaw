/**
 * FFmpeg-based renderer for timelines that contain GL transitions.
 *
 * Pipeline overview
 * ─────────────────
 * 1. Each video clip becomes an ffmpeg -i input (trimmed via -ss/-t).
 * 2. All clips are scaled to the target canvas size.
 * 3. Adjacent clips are joined with xfade (or gltransition if available).
 *    The xfade `offset` is the number of seconds into the concatenated
 *    output at which the transition begins:
 *      offset(i) = Σ clip[0..i-1].effectiveDuration - Σ trans[0..i-1].duration
 * 4. Audio clips are mixed with amix / adelay.
 * 5. Text overlays use the drawtext filter.
 * 6. ffmpeg is spawned and progress is reported via a RegExp on stderr.
 *
 * @module render/ffmpeg-renderer
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTransitionFilter } from './gl-compat.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, '../..');

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Escape a string for use in an FFmpeg filter option value
 * (single-quotes special chars that break filter_complex parsing).
 */
function escapeFilterVal(str) {
  return String(str).replace(/[\\':]/g, c => `\\${c}`);
}

/**
 * Compute the effective rendered duration of a clip (after speed / in-out).
 *
 * @param {object} clip
 * @param {import('../core/project.js').ProjectData} projectData
 * @returns {number}
 */
function effectiveDuration(clip, projectData) {
  if (clip.duration != null) return clip.duration;
  if (clip.out != null && clip.in != null) return (clip.out - clip.in) / (clip.speed ?? 1);
  if (clip.out != null) return clip.out / (clip.speed ?? 1);
  if (projectData && clip.asset) {
    const asset = projectData.assets?.[clip.asset];
    if (asset?.duration != null) return asset.duration / (clip.speed ?? 1);
  }
  return 0;
}

/**
 * Resolve an asset path to absolute.
 *
 * @param {object} asset
 * @param {string} projectDir
 * @returns {string}
 */
function absAssetPath(asset, projectDir) {
  if (path.isAbsolute(asset.path)) return asset.path;
  return path.resolve(projectDir, asset.path);
}

// ── filter_complex builders ────────────────────────────────────────────────

/**
 * Build the video portion of the filter_complex for a sequence of clips
 * joined by transitions.
 *
 * @param {object[]} videoClips  Sorted video clip array from timeline
 * @param {Map<string,object>} transMap  "clipId:clipId" → Transition object
 * @param {object} projectData
 * @param {string} projectDir
 * @param {string[]} ffmpegBin
 * @param {object[]} inputList  Mutable array; append {path, opts} for each new -i input
 * @returns {Promise<{ filterLines: string[], outPad: string }>}
 */
async function buildVideoFilterGraph(
  videoClips, transMap, projectData, projectDir, ffmpegBin, inputList,
) {
  const { width, height, bgColor } = projectData;
  const filterLines = [];

  // ── Step A: create one scaled [vN] pad per clip ────────────────────────

  const scaledPads = [];

  for (const clip of videoClips) {
    const inputIdx = inputList.length;
    const asset = projectData.assets[clip.asset];
    const assetPath = absAssetPath(asset, projectDir);
    const dur = effectiveDuration(clip, projectData);

    // Build input options for this clip
    const inputOpts = [];
    if (clip.in != null) inputOpts.push('-ss', String(clip.in));
    if (dur > 0)         inputOpts.push('-t', String(dur));
    inputList.push({ path: assetPath, opts: inputOpts });

    const pad = `v${inputIdx}`;

    let filterChain = `[${inputIdx}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=${bgColor}`;

    // Speed filter
    if (clip.speed != null && clip.speed !== 1) {
      filterChain += `,setpts=${(1 / clip.speed).toFixed(6)}*PTS`;
    }

    // Volume (for video streams with audio — handled separately via audio graph)
    filterChain += `,setpts=PTS-STARTPTS[${pad}]`;

    filterLines.push(filterChain + ';');
    scaledPads.push(pad);
  }

  if (scaledPads.length === 0) return { filterLines, outPad: null };
  if (scaledPads.length === 1) return { filterLines, outPad: scaledPads[0] };

  // ── Step B: chain xfade / gltransition between consecutive clips ────────

  // Accumulate output time offsets for each transition
  // offset(i) = sum of effective durations of clips 0..i-1 minus sum of prior transition durations
  let cumulativeDur = effectiveDuration(videoClips[0], projectData);
  let cumulativeTransDur = 0;
  let currentPad = scaledPads[0];

  for (let i = 1; i < videoClips.length; i++) {
    const prevClip = videoClips[i - 1];
    const currClip = videoClips[i];
    const transKey = `${prevClip.id}:${currClip.id}`;
    const transition = transMap.get(transKey) ?? null;

    const transDur = transition?.duration ?? 0;
    const offset = Math.max(0, cumulativeDur - cumulativeTransDur - transDur);
    const nextPad = `xf${i}`;

    if (transition && transDur > 0) {
      const filterStr = await resolveTransitionFilter({
        effect:   transition.effect,
        duration: transDur,
        offset,
        params:   transition.params,
        texture:  transition.texture,
        ffmpegBin,
      });

      if (filterStr) {
        filterLines.push(`[${currentPad}][${scaledPads[i]}]${filterStr}[${nextPad}];`);
        cumulativeTransDur += transDur;
      } else {
        // No transition filter available — just concat
        filterLines.push(`[${currentPad}][${scaledPads[i]}]concat=n=2:v=1:a=0[${nextPad}];`);
      }
    } else {
      // No transition between these clips — hard cut via concat
      filterLines.push(`[${currentPad}][${scaledPads[i]}]concat=n=2:v=1:a=0[${nextPad}];`);
    }

    cumulativeDur += effectiveDuration(currClip, projectData);
    currentPad = nextPad;
  }

  return { filterLines, outPad: currentPad };
}

/**
 * Build the audio portion of the filter_complex.
 *
 * Mixes:
 *  - Audio tracks embedded in video clips (if not muted)
 *  - Standalone audio clips from timeline.audio
 *
 * @param {object[]} videoClips
 * @param {object[]} audioClips
 * @param {object} projectData
 * @param {string} projectDir
 * @param {object[]} inputList  Mutable — audio files appended here
 * @returns {{ filterLines: string[], outPad: string|null }}
 */
function buildAudioFilterGraph(videoClips, audioClips, projectData, projectDir, inputList) {
  const filterLines = [];
  const mixPads = [];

  // ── Video-embedded audio ─────────────────────────────────────────────────

  for (let i = 0; i < videoClips.length; i++) {
    const clip = videoClips[i];
    const asset = projectData.assets[clip.asset];
    if (!asset || asset.hasAudio === false || clip.muted) continue;

    // The video clip was already added to inputList at position i (same order)
    const inputIdx = i; // inputList indices 0..N-1 are video clips
    const vol = clip.volume ?? 1;
    const dur = effectiveDuration(clip, projectData);
    const pad = `va${i}`;
    let chain = `[${inputIdx}:a]`;
    if (dur > 0) chain += `atrim=0:${dur},`;
    chain += `asetpts=PTS-STARTPTS`;
    if (vol !== 1) chain += `,volume=${vol.toFixed(4)}`;
    chain += `[${pad}]`;
    filterLines.push(chain + ';');
    mixPads.push({ pad, delay: 0 });
  }

  // ── Standalone audio clips ───────────────────────────────────────────────

  for (const audioClip of audioClips) {
    const asset = projectData.assets[audioClip.asset];
    if (!asset || audioClip.muted) continue;

    const assetPath = absAssetPath(asset, projectDir);
    const inputIdx = inputList.length;
    const dur = effectiveDuration(audioClip, projectData);
    const inputOpts = [];
    if (audioClip.in != null) inputOpts.push('-ss', String(audioClip.in));
    if (dur > 0)              inputOpts.push('-t', String(dur));
    if (audioClip.loop)       inputOpts.push('-stream_loop', '-1');
    inputList.push({ path: assetPath, opts: inputOpts });

    const vol = audioClip.volume ?? 1;
    const startMs = Math.round((audioClip.start ?? 0) * 1000);
    const pad = `aa${inputIdx}`;
    let chain = `[${inputIdx}:a]asetpts=PTS-STARTPTS`;
    if (vol !== 1) chain += `,volume=${vol.toFixed(4)}`;
    if (audioClip.fadeIn != null)  chain += `,afade=t=in:st=0:d=${audioClip.fadeIn}`;
    if (audioClip.fadeOut != null && dur > 0)
      chain += `,afade=t=out:st=${Math.max(0, dur - audioClip.fadeOut)}:d=${audioClip.fadeOut}`;
    chain += `[${pad}]`;
    filterLines.push(chain + ';');
    mixPads.push({ pad, delay: startMs });
  }

  if (mixPads.length === 0) return { filterLines, outPad: null };

  if (mixPads.length === 1) {
    // Single audio source — rename to final pad
    const renamed = 'afinal';
    filterLines.push(`[${mixPads[0].pad}]anull[${renamed}];`);
    return { filterLines, outPad: renamed };
  }

  // Multiple sources: add adelay then amix
  const delayedPads = [];
  for (const { pad, delay } of mixPads) {
    const dpPad = `${pad}d`;
    filterLines.push(`[${pad}]adelay=${delay}|${delay}[${dpPad}];`);
    delayedPads.push(dpPad);
  }

  const mixInputs = delayedPads.map(p => `[${p}]`).join('');
  filterLines.push(`${mixInputs}amix=inputs=${delayedPads.length}:normalize=0[afinal];`);

  return { filterLines, outPad: 'afinal' };
}

/**
 * Build drawtext filter fragments for text clips that fall within the
 * overall video timeline.
 *
 * @param {object[]} textClips
 * @returns {string[]}  Array of drawtext= filter fragments to chain onto vout
 */
function buildTextFilters(textClips) {
  const parts = [];

  for (const tc of textClips) {
    const start = tc.start ?? 0;
    const dur   = tc.duration ?? 3;
    const end   = start + dur;

    const text     = escapeFilterVal(tc.content ?? '');
    const fontSize = tc.fontSize ?? 40;
    const color    = (tc.color ?? '#ffffff').replace('#', '0x');
    const fontfile = tc.font ? `:fontfile=${escapeFilterVal(tc.font)}` : '';
    const align    = tc.align === 'left' ? 'x=20' : tc.align === 'right' ? 'x=w-text_w-20' : 'x=(w-text_w)/2';

    parts.push(
      `drawtext=text='${text}':fontsize=${fontSize}:fontcolor=${color}${fontfile}` +
      `:${align}:y=(h*0.85-text_h/2)` +
      `:enable='between(t,${start},${end})'`,
    );
  }

  return parts;
}

// ── Main export ────────────────────────────────────────────────────────────

/**
 * Render the timeline entirely via ffmpeg (no FFCreator).
 *
 * @param {import('../core/timeline-model.js').TimelineModel} model
 * @param {import('../core/project.js').ProjectData} projectData
 * @param {string} projectDir
 * @param {object} renderOpts
 * @param {string} renderOpts.output
 * @param {number} [renderOpts.crf]
 * @param {string} [renderOpts.preset]
 * @param {string} [renderOpts.audioBitrate]
 * @param {string} [renderOpts.ffmpegBin]
 * @param {{ json?: boolean, quiet?: boolean, watch?: boolean }} [reportOpts]
 * @returns {Promise<string>}  Resolves with output path
 */
export async function renderWithFFmpeg(model, projectData, projectDir, renderOpts, reportOpts = {}) {
  const {
    output,
    crf          = 23,
    preset       = 'fast',
    audioBitrate = '192k',
    ffmpegBin    = 'ffmpeg',
  } = renderOpts;

  const timeline    = model.toJSON();
  const videoClips  = [...timeline.video].sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
  const audioClips  = timeline.audio;
  const textClips   = timeline.text;

  // Build transition lookup map
  const transMap = new Map();
  for (const t of timeline.transitions) {
    transMap.set(`${t.between[0]}:${t.between[1]}`, t);
  }

  // ── Assemble inputs and filter_complex ────────────────────────────────

  /** @type {{ path: string, opts: string[] }[]} */
  const inputList = [];

  const videoGraph = await buildVideoFilterGraph(
    videoClips, transMap, projectData, projectDir, ffmpegBin, inputList,
  );

  // Audio graph uses the same inputList (video inputs are already there)
  const audioGraph = buildAudioFilterGraph(
    videoClips, audioClips, projectData, projectDir, inputList,
  );

  // ── Combine filter lines ─────────────────────────────────────────────

  const allFilterLines = [
    ...videoGraph.filterLines,
    ...audioGraph.filterLines,
  ];

  // Apply text overlays onto the video output pad
  let finalVideoPad = videoGraph.outPad;
  if (finalVideoPad && textClips.length > 0) {
    const textFilters = buildTextFilters(textClips);
    if (textFilters.length > 0) {
      const textPad = 'vtext';
      allFilterLines.push(`[${finalVideoPad}]${textFilters.join(',')}[${textPad}];`);
      finalVideoPad = textPad;
    }
  }

  // ── Build ffmpeg argument list ────────────────────────────────────────

  const args = [];

  // Inputs
  for (const { path: p, opts } of inputList) {
    args.push(...opts, '-i', p);
  }

  // filter_complex
  if (allFilterLines.length > 0) {
    // Strip trailing semicolons from the last line
    const filterStr = allFilterLines.join('\n').replace(/;\s*$/, '');
    args.push('-filter_complex', filterStr);
  }

  // Map outputs
  if (finalVideoPad) {
    args.push('-map', `[${finalVideoPad}]`);
  } else if (inputList.length > 0) {
    args.push('-map', '0:v');
  }

  if (audioGraph.outPad) {
    args.push('-map', `[${audioGraph.outPad}]`);
  }

  // Encoding options
  args.push(
    '-c:v', 'libx264',
    '-crf', String(crf),
    '-preset', preset,
    '-c:a', 'aac',
    '-b:a', audioBitrate,
    '-movflags', '+faststart',
    '-y',
    output,
  );

  // ── Spawn ffmpeg ──────────────────────────────────────────────────────

  return new Promise((resolve, reject) => {
    if (!reportOpts.quiet && !reportOpts.json) {
      process.stdout.write(`Rendering via FFmpeg…\n`);
    }
    if (reportOpts.json) {
      process.stdout.write(JSON.stringify({ type: 'start' }) + '\n');
    }

    const proc = spawn(ffmpegBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let durationSec = null;
    let lastPct = -1;

    // Parse progress from ffmpeg stderr
    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString();

      // Extract total duration on first encounter
      if (!durationSec) {
        const m = text.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
        if (m) {
          durationSec = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]);
        }
      }

      // Extract current time for progress
      const tm = text.match(/time=\s*(\d+):(\d+):([\d.]+)/);
      if (tm && durationSec) {
        const elapsed = parseInt(tm[1]) * 3600 + parseInt(tm[2]) * 60 + parseFloat(tm[3]);
        const pct = Math.min(100, Math.round((elapsed / durationSec) * 100));
        if (pct !== lastPct) {
          lastPct = pct;
          if (reportOpts.json) {
            process.stdout.write(JSON.stringify({ type: 'progress', percent: pct / 100 }) + '\n');
          } else if (!reportOpts.quiet) {
            const bar = '█'.repeat(Math.floor(pct / 4)) + '░'.repeat(25 - Math.floor(pct / 4));
            process.stdout.write(`\r[${bar}] ${pct}%   `);
          }
        }
      }
    });

    proc.on('close', (code) => {
      if (code === 0) {
        if (!reportOpts.quiet && !reportOpts.json) process.stdout.write('\n');
        if (reportOpts.json) {
          process.stdout.write(JSON.stringify({ type: 'complete', output }) + '\n');
        }
        resolve(output);
      } else {
        const err = new Error(`ffmpeg exited with code ${code}`);
        err.code = 'RENDER_ERROR';
        reject(err);
      }
    });

    proc.on('error', (err) => {
      err.code = err.code ?? 'RENDER_ERROR';
      reject(err);
    });
  });
}

/**
 * Returns true if the timeline contains any transition that requires the
 * FFmpeg pipeline (gl: prefix OR any transition at all, since xfade needs
 * the FFmpeg pipeline).
 *
 * @param {import('../core/timeline-model.js').TimelineModel} model
 * @returns {boolean}
 */
export function needsFFmpegPipeline(model) {
  const timeline = model.toJSON();
  return timeline.transitions.some(t => t.effect.startsWith('gl:'));
}
