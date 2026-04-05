#!/usr/bin/env node
/**
 * Fetch all 121 GL Transitions GLSL files from GitHub.
 * Safe to re-run: skips already-downloaded files.
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRANSITIONS_DIR = path.resolve(__dirname, '../vendor/gl-transitions/transitions');
const API_URL = 'https://api.github.com/repos/gl-transitions/gl-transitions/contents/transitions';
const RAW_BASE = 'https://raw.githubusercontent.com/gl-transitions/gl-transitions/main/transitions';

mkdirSync(TRANSITIONS_DIR, { recursive: true });

console.log('Fetching file list from GitHub API...');
let response;
try {
  response = execSync(`curl -sL "${API_URL}"`, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
} catch (e) {
  console.error('Failed to fetch from GitHub API:', e.message);
  process.exit(1);
}

let files;
try {
  files = JSON.parse(response);
} catch (e) {
  console.error('Failed to parse GitHub API response:', e.message);
  process.exit(1);
}

const glslFiles = files.filter(f => f.name.endsWith('.glsl'));
console.log(`Found ${glslFiles.length} .glsl files\n`);

let downloaded = 0;
let skipped = 0;
let failed = 0;

for (const file of glslFiles) {
  const destPath = path.join(TRANSITIONS_DIR, file.name);

  if (existsSync(destPath)) {
    skipped++;
    process.stdout.write(`S ${file.name}\n`);
    continue;
  }

  const rawUrl = `${RAW_BASE}/${file.name}`;
  try {
    const content = execSync(`curl -sL "${rawUrl}"`, { encoding: 'utf-8', maxBuffer: 5 * 1024 * 1024 });
    writeFileSync(destPath, content, 'utf-8');
    downloaded++;
    process.stdout.write(`D ${file.name}\n`);
  } catch (e) {
    failed++;
    process.stdout.write(`F ${file.name} — ${e.message}\n`);
  }
}

console.log(`\nDone: ${downloaded} downloaded, ${skipped} skipped, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
