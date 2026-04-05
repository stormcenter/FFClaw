/**
 * Timeline → FFCreator translation layer.
 *
 * Translates a TimelineModel into a configured FFCreator instance ready for
 * rendering.  The pipeline is:
 *
 *   1. Collect cut points — each video clip becomes one FFScene.
 *   2. Determine clip visibility — which text clips overlap each scene.
 *   3. Set transitions — map our effect names to FFCreator effect strings.
 *   4. Add audio — FFAudio elements are attached globally to the creator.
 *   5. Add text — FFText elements are scoped to the scenes they appear in.
 *
 * @module core/builder
 */

import path from 'node:path';

// FFCreator is loaded lazily (dynamic import) so that commands which don't
// render video (new, import, timeline show, …) can start without requiring
// all of FFCreator's native dependencies to be installed.
let _FFCreator, _FFScene, _FFVideo, _FFImage, _FFText, _FFAudio;
async function loadFFCreator() {
  if (_FFCreator) return;
  // ffcreator is a CJS module; dynamic import wraps module.exports as .default
  const mod = await import('ffcreator');
  const pkg = mod.default ?? mod;
  _FFCreator = pkg.FFCreator;
  _FFScene   = pkg.FFScene;
  _FFVideo   = pkg.FFVideo;
  _FFImage   = pkg.FFImage;
  _FFText    = pkg.FFText;
  _FFAudio   = pkg.FFAudio;
}

// Proxy getters used inside synchronous helpers — call loadFFCreator() before build()
const getFFCreator = () => _FFCreator;
const getFFScene   = () => _FFScene;
const getFFVideo   = () => _FFVideo;
const getFFImage   = () => _FFImage;
const getFFText    = () => _FFText;
const getFFAudio   = () => _FFAudio;

// ── Constants ─────────────────────────────────────────────────────────────────

/** Map our effect names → FFCreator transition strings. */
const TRANSITION_MAP = {
  fade:        'fade',
  dissolve:    'dissolve',
  wipe:        'wipeLeft',
  'wipe-left':  'wipeLeft',
  'wipe-right': 'wipeRight',
  'wipe-up':    'wipeUp',
  'wipe-down':  'wipeDown',
  slide:       'slideLeft',
  'slide-left':  'slideLeft',
  'slide-right': 'slideRight',
  zoom:        'zoom',
  blur:        'blur',
};

/** Default transition when an unknown effect name is given. */
const DEFAULT_TRANSITION = 'fade';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Resolve an asset's absolute file path from the project directory.
 *
 * @param {import('./project.js').AssetEntry} asset
 * @param {string} projectDir
 * @returns {string}
 */
function resolveAssetPath(asset, projectDir) {
  if (path.isAbsolute(asset.path)) return asset.path;
  return path.resolve(projectDir, asset.path);
}

/**
 * Compute a clip's rendered duration on the timeline.
 * Falls back to the asset's probed duration when no explicit range is set.
 *
 * @param {import('./timeline-model.js').VideoClip|import('./timeline-model.js').AudioClip} clip
 * @param {import('./project.js').ProjectData} [projectData]  Used for asset-duration fallback
 * @returns {number}
 */
function clipDuration(clip, projectData) {
  if (clip.duration != null) return clip.duration;
  if (clip.out != null && clip.in != null) return (clip.out - clip.in) / (clip.speed ?? 1);
  if (clip.out != null) return clip.out / (clip.speed ?? 1);
  // Fallback: use the asset's probed duration
  if (projectData && clip.asset) {
    const asset = projectData.assets[clip.asset];
    if (asset?.duration != null) return asset.duration / (clip.speed ?? 1);
  }
  return 0;
}

/**
 * Look up an asset in the project and throw a typed error if missing.
 *
 * @param {import('./project.js').ProjectData} projectData
 * @param {string} assetId
 * @param {string} clipId
 * @returns {import('./project.js').AssetEntry}
 */
function requireAsset(projectData, assetId, clipId) {
  const asset = projectData.assets[assetId];
  if (!asset) {
    const e = new Error(
      `Asset '${assetId}' referenced by clip '${clipId}' not found in project assets`,
    );
    e.code = 'ASSET_NOT_FOUND';
    throw e;
  }
  return asset;
}

// ── Scene builders ────────────────────────────────────────────────────────────

/**
 * Create an FFScene for a single video or image clip.
 *
 * @param {import('./timeline-model.js').VideoClip} clip
 * @param {import('./project.js').ProjectData}      projectData
 * @param {string}                                  projectDir
 * @param {string|null}                             transEffect  FFCreator effect string or null
 * @param {number}                                  transDur     Transition duration in seconds
 * @returns {FFScene}
 */
function buildVideoScene(clip, projectData, projectDir, transEffect, transDur) {
  const { width, height, bgColor } = projectData;
  const sceneDur = clipDuration(clip, projectData);

  const scene = new (getFFScene())();
  scene.setBgColor(bgColor);
  scene.setDuration(sceneDur);

  if (transEffect) {
    scene.setTransition(transEffect, transDur);
  }

  const asset     = requireAsset(projectData, clip.asset, clip.id);
  const assetPath = resolveAssetPath(asset, projectDir);

  if (clip.type === 'image') {
    const img = new (getFFImage())({ path: assetPath, x: width / 2, y: height / 2 });
    if (clip.animateIn)  img.addEffect(clip.animateIn,  0.5, 0);
    if (clip.animateOut) img.addEffect(clip.animateOut, 0.5, Math.max(0, sceneDur - 0.5));
    scene.addChild(img);
  } else {
    // type === 'video'
    const ffvideo = new (getFFVideo())({
      path:   assetPath,
      x:      width / 2,
      y:      height / 2,
      width,
      height,
    });

    if (clip.in  != null) ffvideo.setStartTime(clip.in);
    if (clip.out != null) ffvideo.setEndTime(clip.out);
    if (clip.speed != null && clip.speed !== 1) ffvideo.setSpeed(clip.speed);

    const effectiveVolume = clip.muted ? 0 : (clip.volume ?? 1);
    if (effectiveVolume !== 1) ffvideo.setVolume(effectiveVolume);

    if (clip.animateIn)  ffvideo.addEffect(clip.animateIn,  0.5, 0);
    if (clip.animateOut) ffvideo.addEffect(clip.animateOut, 0.5, Math.max(0, sceneDur - 0.5));

    scene.addChild(ffvideo);
  }

  return scene;
}

/**
 * Add text clips that temporally overlap a scene to it as FFText children.
 *
 * Text clip coordinates are relative to the scene's time window, so a text
 * clip starting at timeline second 5 that appears in a scene starting at
 * second 3 will show up at relative second 2 within the scene.
 *
 * @param {FFScene}                                scene
 * @param {import('./timeline-model.js').TextClip[]} textClips
 * @param {number}                                 sceneStart  Timeline seconds
 * @param {number}                                 sceneEnd    Timeline seconds
 * @param {number}                                 width       Canvas width
 * @param {number}                                 height      Canvas height
 */
function addTextClips(scene, textClips, sceneStart, sceneEnd, width, height) {
  for (const tc of textClips) {
    const tcStart = tc.start ?? 0;
    const tcEnd   = tcStart + (tc.duration ?? 3);

    // Skip clips outside this scene's window
    if (tcEnd <= sceneStart || tcStart >= sceneEnd) continue;

    // Relative timing inside the scene
    const relStart = Math.max(0, tcStart - sceneStart);
    const relEnd   = Math.min(sceneEnd - sceneStart, tcEnd - sceneStart);
    const relDur   = relEnd - relStart;

    const fftext = new (getFFText())({
      text:     tc.content ?? '',
      x:        width / 2,
      y:        Math.round(height * 0.85),
      fontSize: tc.fontSize ?? 40,
      color:    tc.color ?? '#ffffff',
    });

    if (tc.font)  fftext.setFont(tc.font);
    if (tc.align) fftext.setAlign(tc.align);

    const animDur = Math.min(0.3, relDur / 3);
    if (tc.animateIn)  fftext.addEffect(tc.animateIn,  animDur, relStart);
    if (tc.animateOut) fftext.addEffect(tc.animateOut, animDur, relStart + relDur - animDur);

    scene.addChild(fftext);
  }
}

/**
 * Build a fallback scene covering the full timeline when there are no video clips.
 *
 * @param {string} bgColor
 * @param {number} duration
 * @returns {FFScene}
 */
function buildEmptyScene(bgColor, duration) {
  const scene = new (getFFScene())();
  scene.setBgColor(bgColor);
  scene.setDuration(Math.max(duration, 0.1));
  return scene;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Translate a TimelineModel into an FFCreator instance ready to render.
 *
 * @param {import('./timeline-model.js').TimelineModel} model
 * @param {import('./project.js').ProjectData}          projectData
 * @param {string}                                      projectDir  Absolute path
 * @param {object}  [renderOpts]
 * @param {string}  [renderOpts.output]        Output file path
 * @param {number}  [renderOpts.crf]           CRF value (0–51; lower = better quality)
 * @param {string}  [renderOpts.preset]        x264 preset (e.g. 'fast', 'slow')
 * @param {string}  [renderOpts.audioBitrate]  Audio bitrate (e.g. '192k')
 * @returns {Promise<FFCreator>}
 */
export async function build(model, projectData, projectDir, renderOpts = {}) {
  await loadFFCreator();
  const timeline = model.toJSON();
  const { width, height, fps, bgColor } = projectData;
  const totalDuration = model.getDuration();

  const {
    output       = path.join(projectDir, 'output.mp4'),
    crf          = 23,
    preset       = 'fast',
    audioBitrate = '192k',
  } = renderOpts;

  // ── 1. Create FFCreator ────────────────────────────────────────────────────

  const cacheDir = path.join(projectDir, '.ffclaw-cache');

  const creator = new (getFFCreator())({
    width,
    height,
    fps,
    output,
    crf,
    preset,
    bgColor,
    cacheDir,
    // Disable inkpaint's URL preloader — it hangs on local file:// paths.
    // FFCreator's node preProcessing (ffprobe/ffmpeg frame extraction) still runs.
    preload: false,
  });

  // Set audio bitrate via FFmpeg output options
  creator.setOutOptions(['-b:a', audioBitrate]);

  // ── 2. Build transition lookup: "clipId1:clipId2" → Transition ─────────────

  /** @type {Map<string, import('./timeline-model.js').Transition>} */
  const transitionMap = new Map();
  for (const t of timeline.transitions) {
    const key = `${t.between[0]}:${t.between[1]}`;
    transitionMap.set(key, t);
  }

  // ── 3. Cut scenes — one FFScene per video clip ─────────────────────────────

  const videoClips = [...timeline.video].sort((a, b) => (a.start ?? 0) - (b.start ?? 0));

  if (videoClips.length === 0) {
    // No video — render a coloured background for the full duration
    const scene = buildEmptyScene(bgColor, totalDuration || 1);
    addTextClips(scene, timeline.text, 0, totalDuration || 1, width, height);
    creator.addChild(scene);
  } else {
    for (let i = 0; i < videoClips.length; i++) {
      const clip     = videoClips[i];
      const nextClip = videoClips[i + 1] ?? null;

      // Look up any transition declared between this clip and the next
      const transKey    = nextClip ? `${clip.id}:${nextClip.id}` : null;
      const transition  = transKey ? (transitionMap.get(transKey) ?? null) : null;
      const transEffect = transition
        ? (TRANSITION_MAP[transition.effect] ?? DEFAULT_TRANSITION)
        : null;
      const transDur = transition?.duration ?? 0.5;

      const scene = buildVideoScene(clip, projectData, projectDir, transEffect, transDur);

      // Add text overlays that fall within this clip's time window
      const sceneStart = clip.start ?? 0;
      const sceneEnd   = sceneStart + clipDuration(clip, projectData);
      addTextClips(scene, timeline.text, sceneStart, sceneEnd, width, height);

      creator.addChild(scene);
    }
  }

  // ── 4. Add audio clips globally ────────────────────────────────────────────

  for (const audioClip of timeline.audio) {
    const asset     = requireAsset(projectData, audioClip.asset, audioClip.id);
    const assetPath = resolveAssetPath(asset, projectDir);
    const dur       = clipDuration(audioClip, projectData);

    const ffaudio = new (getFFAudio())({
      path:  assetPath,
      start: audioClip.start ?? 0,
      ...(dur  > 0           && { duration: dur }),
      ...(audioClip.in != null && { ss: audioClip.in }),
      loop:  audioClip.loop ?? false,
    });

    const effectiveVolume = audioClip.muted ? 0 : (audioClip.volume ?? 1);
    if (effectiveVolume !== 1) ffaudio.setVolume(effectiveVolume);

    if (audioClip.fadeIn  != null) ffaudio.setFadeIn(audioClip.fadeIn);
    if (audioClip.fadeOut != null) ffaudio.setFadeOut(audioClip.fadeOut);

    creator.addAudio(ffaudio);
  }

  return creator;
}
