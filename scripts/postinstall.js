/**
 * postinstall script — ensures FFCreator's own dependencies are installed.
 *
 * ClipCraft's package.json declares ffcreator as "file:./vendor/FFCreator".
 * npm creates the symlink, but does NOT run FFCreator's own npm install.
 * This script bridges that gap.
 *
 * Safe to re-run: checks for existing node_modules before installing.
 *
 * @module scripts/postinstall
 */

import { exists, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FFCREATOR_DIR = join(ROOT, 'vendor', 'FFCreator');
const REQUIRED_BINS = ['ffmpeg', 'ffprobe'];

async function isInstalled(dir) {
  try {
    await access(join(dir, 'node_modules', '.package-lock.json'));
    return true;
  } catch {
    // Fallback: check if at least one key dependency is present
    try {
      await access(join(dir, 'node_modules', 'fluent-ffmpeg'));
      return true;
    } catch {
      return false;
    }
  }
}

async function checkBinaries(dir) {
  const missing = [];
  for (const bin of REQUIRED_BINS) {
    try {
      await access(join(dir, 'node_modules', '.bin', bin));
    } catch {
      missing.push(bin);
    }
  }
  return missing;
}

function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`exit code ${code}`))));
    child.on('error', reject);
  });
}

async function main() {
  // Check if FFCreator submodule has been cloned
  try {
    await access(join(FFCREATOR_DIR, 'package.json'));
  } catch {
    console.warn('[postinstall] FFCreator submodule not found at vendor/FFCreator.');
    console.warn('[postinstall] Run: git submodule update --init');
    return;
  }

  const installed = await isInstalled(FFCREATOR_DIR);
  const missingBins = await checkBinaries(FFCREATOR_DIR);

  if (installed && missingBins.length === 0) {
    // Already fully installed
    return;
  }

  console.log('[postinstall] Installing FFCreator dependencies...');

  try {
    // Install without devDependencies to keep it lean
    await run('npm', ['install', '--omit=dev', '--prefer-offline'], FFCREATOR_DIR);
    console.log('[postinstall] FFCreator dependencies installed.');
  } catch (err) {
    console.error('[postinstall] Failed to install FFCreator dependencies:', err.message);
    console.error('[postinstall] Try manually: cd vendor/FFCreator && npm install');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[postinstall] Unexpected error:', err.message);
  process.exit(1);
});
