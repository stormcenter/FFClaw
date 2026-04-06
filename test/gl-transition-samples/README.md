# GL Transition Samples

All 121 GL Transition effects rendered as 5-second sample videos.

**Generated:** 2026-04-06
**Resolution:** 1024×1024
**FPS:** 30
**Transition duration:** 1 second (at center)
**Total videos:** 121 / 121 ✓ (0 failures)

## Video Structure

Each video is 5 seconds total:
- **0–2s**: from image (static)
- **2–3s**: GL transition (1 second blend at center)
- **3–5s**: to image (static)

## CLI Usage

```bash
# List all 121 transitions
node bin/ffclaw-transition.js list

# Show params for a specific transition
node bin/ffclaw-transition.js list-params cross-zoom

# Render a transition (full video)
node bin/ffclaw-transition.js render cross-zoom \
  --from scene1.jpg \
  --to scene2.jpg \
  --duration 1.0 \
  --from-duration 2.0 \
  --to-duration 2.0 \
  --output out.mp4

# Preview (single blended frame)
node bin/ffclaw-transition.js preview cross-zoom \
  --from scene1.jpg \
  --to scene2.jpg \
  --output preview.png

# With shader params
node bin/ffclaw-transition.js render cross-zoom \
  --from scene1.jpg \
  --to scene2.jpg \
  --params '{"strength": 0.8}' \
  --output out.mp4

# Batch render all 121 samples
node --input-type=module -e "
import { renderAllSamples } from './src/transitions/queue.js';
renderAllSamples(
  'test/fixtures/test-from.jpg',
  'test/fixtures/test-to.jpg',
  './test/gl-transition-samples',
  { fps: 30, width: 1024, height: 1024, duration: 1.0, fromDuration: 2.0, toDuration: 2.0 }
);
"
```

## Architecture

- **`src/transitions/gl-renderer.js`** — Core WebGL/GLSL transition renderer
  - Uses `gl-transition` (npm) for GLSL shader rendering
  - Uses `gl` (npm) for headless WebGL context
  - Uses `gl-texture2d` for WebGL texture creation
  - Uses `get-pixels` / `save-pixels` for image I/O
  - Uses FFmpeg (stock, no recompile) for frame extraction and video encoding
- **`src/transitions/queue.js`** — Batch rendering queue (121 transitions)
- **`src/transitions/registry.js`** — 121 transitions metadata
- **`src/transitions/params.js`** — Param validation utilities
- **`bin/ffclaw-transition.js`** — CLI entry point
- **`vendor/FFCreator/node_modules/gl-transitions/index.js`** — GLSL shader source for all 121 transitions

## Transitions (121 total)

book-flip, bow-tie-horizontal, bow-tie-vertical, cannabisleaf, coord-from-in, crosswarp,
dreamy, fade, fold, fragment, glitch-displace, glitch-memories, heart, hsvfade,
horizontal-close, horizontal-open, inverted-page-curl, left-right, multiply-blend,
randomnoisex, rotate-transition, scale-in, simple-flip, swirl, tangent-motion-blur,
top-bottom, vertical-close, vertical-open, windowblinds, wipe-down, wipe-left,
wipe-right, wipe-up, x-axis-translation, zoom-in-circles, zoom-in-out, advanced-mosaic,
angular, block-dissolve, bounce, bow-tie-with-parameter, box, burn, burn0,
butterfly-wave-scrawler, chessboard, circle, circle-crop, circleopen, colour-distance,
colorphase, crazy-parametric-fun, crosshatch, cross-zoom, cube, defocus-blur,
directional, directional-easing, directional-scaled, directionalwarp, directionalwipe,
displacement, dissolve, doom-screen-transition, doorway, dreamy-zoom, edge-transition,
fadecolor, fadegrayscale, film-burn, flyeye, grid-flip, hexagonalize, kaleidoscope,
linear-blur, luma, luminance-melt, morph, mosaic, mosaic-transition, overexposure,
parametric-glitch, perlin, pinwheel, pixelize, polar-function, polka-dots-curtain,
power-kaleido, puzzle-right, radial, randomsquares, rectangle, rectangle-crop,
ripple, rolls, rotate-scale-fade, rotate-scale-vanish, simple-zoom, simple-zoom-out,
slides, split-slide-in-horizontal, split-slide-in-out-horizontal, split-slide-in-out-vertical,
split-slide-in-vertical, split-slide-out-horizontal, split-slide-out-vertical,
squareswire, squeeze, star-wipe, static-wipe, static-fade, stereo-viewer, swap,
tiles-wave, tv-static, undulating-burn-out, water-drop, wind, windowslice,
zoom-left-wipe, zoom-right-wipe
