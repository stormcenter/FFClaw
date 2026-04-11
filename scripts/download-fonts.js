#!/usr/bin/env node
/**
 * Download all built-in fonts for ASS subtitle rendering.
 *
 * Fonts are stored in assets/fonts/ and referenced by src/ass/fonts.js.
 * Run manually or via `npm run postinstall` (configured in package.json).
 */

import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { pipeline } from 'node:stream';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const streamPipeline = promisify(pipeline);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = path.resolve(__dirname, '../assets/fonts');

// ── Font definitions ──────────────────────────────────────────────────────────

const FONTS = [
  {
    name: 'Noto Sans CJK SC Regular',
    file: 'NotoSansCJKsc-Regular.otf',
    url:  'https://github.com/googlefonts/noto-cjk/raw/NotoSansV2.001/NotoSansCJKsc-Regular.otf',
    minSize: 10 * 1024 * 1024, // 10 MB
  },
  {
    name: 'Noto Sans CJK SC Bold',
    file: 'NotoSansCJKsc-Bold.otf',
    url:  'https://github.com/googlefonts/noto-cjk/raw/NotoSansV2.001/NotoSansCJKsc-Bold.otf',
    minSize: 10 * 1024 * 1024,
  },
  {
    name: 'Noto Serif CJK SC Regular',
    file: 'NotoSerifCJKsc-Regular.otf',
    url:  'https://github.com/googlefonts/noto-cjk/raw/NotoSerifV1.001/NotoSerifCJKsc-Regular.otf',
    minSize: 100 * 1024, // 100 KB (smaller because V1 serif subset)
  },
  {
    name: 'Roboto Regular',
    file: 'Roboto-Regular.ttf',
    url:  'https://github.com/googlefonts/roboto/raw/main/src/hinted/Roboto-Regular.ttf',
    minSize: 100 * 1024,
  },
  {
    name: 'Roboto Bold',
    file: 'Roboto-Bold.ttf',
    url:  'https://github.com/googlefonts/roboto/raw/main/src/hinted/Roboto-Bold.ttf',
    minSize: 100 * 1024,
  },
];

// ── Download helpers ───────────────────────────────────────────────────────────

async function downloadFile(url, destPath, minSize) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  await streamPipeline(response.body, createWriteStream(destPath));
}

function ensureFontDir() {
  if (!existsSync(FONTS_DIR)) {
    mkdirSync(FONTS_DIR, { recursive: true });
  }
}

function validateFont(filePath, minSize) {
  if (!existsSync(filePath)) {
    throw new Error(`Missing: ${filePath}`);
  }
  const size = statSync(filePath).size;
  if (size < minSize) {
    throw new Error(`${filePath} is too small (${size} bytes), expected ≥ ${minSize}`);
  }
  return size;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  ensureFontDir();

  let allOk = true;

  for (const font of FONTS) {
    const destPath = path.join(FONTS_DIR, font.file);
    process.stdout.write(`Downloading ${font.name}… `);

    try {
      // Skip if already exists and valid
      if (existsSync(destPath)) {
        const size = statSync(destPath).size;
        if (size >= minSize) {
          process.stdout.write(`skipped (${(size / 1024 / 1024).toFixed(1)} MB already present)\n`);
          continue;
        }
      }

      await downloadFile(font.url, destPath, font.minSize);
      const size = validateFont(destPath, font.minSize);
      process.stdout.write(`done (${(size / 1024 / 1024).toFixed(1)} MB)\n`);
    } catch (err) {
      process.stderr.write(`ERROR: ${err.message}\n`);
      allOk = false;
    }
  }

  if (!allOk) {
    process.exit(1);
  }

  process.stdout.write('\nAll fonts ready.\n');
}

// Only run if executed directly (not imported as module)
import.meta.url === `file://${process.argv[1]}` && main().catch(err => {
  console.error(err);
  process.exit(1);
});

export { FONTS, FONTS_DIR };
