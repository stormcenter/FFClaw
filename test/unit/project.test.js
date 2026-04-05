import { tmpdir } from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';

import {
  createProjectData,
  load,
  save,
  exists,
  validate,
  SCHEMA_VERSION,
  RATIO_PRESETS,
} from '../../src/core/project.js';

describe('createProjectData', () => {
  test('creates 16:9 project with defaults', () => {
    const data = createProjectData({ name: 'test' });
    expect(data.version).toBe(SCHEMA_VERSION);
    expect(data.name).toBe('test');
    expect(data.ratio).toBe('16:9');
    expect(data.width).toBe(1920);
    expect(data.height).toBe(1080);
    expect(data.fps).toBe(30);
    expect(data.bgColor).toBe('#000000');
    expect(data.assets).toEqual({});
    expect(data.timeline).toEqual({ video: [], audio: [], text: [], transitions: [] });
  });

  test('creates 9:16 project', () => {
    const data = createProjectData({ name: 'vertical', ratio: '9:16' });
    expect(data.width).toBe(1080);
    expect(data.height).toBe(1920);
  });

  test('respects custom fps', () => {
    const data = createProjectData({ name: 'hi-fps', fps: 60 });
    expect(data.fps).toBe(60);
  });

  test('falls back to 16:9 for unknown ratio', () => {
    const data = createProjectData({ name: 'test', ratio: 'invalid' });
    expect(data.width).toBe(RATIO_PRESETS['16:9'].width);
  });

  test('accepts custom width/height override', () => {
    const data = createProjectData({ name: 'custom', width: 800, height: 600 });
    expect(data.width).toBe(800);
    expect(data.height).toBe(600);
  });
});

describe('validate', () => {
  test('passes for a valid project', () => {
    const data = createProjectData({ name: 'ok' });
    expect(() => validate(data)).not.toThrow();
  });

  test('throws INVALID_PROJECT when not an object', () => {
    expect(() => validate(null)).toThrow();
    expect(() => validate(null)).toThrow(expect.objectContaining({ code: 'INVALID_PROJECT' }));
  });

  test('throws INVALID_PROJECT for missing required field', () => {
    const data = createProjectData({ name: 'ok' });
    delete data.timeline;
    expect(() => validate(data)).toThrow(expect.objectContaining({ code: 'INVALID_PROJECT' }));
  });
});

describe('save and load', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'ffclaw-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('round-trips project data', async () => {
    const data = createProjectData({ name: 'round-trip', ratio: '1:1' });
    await save(tmpDir, data);
    const loaded = await load(tmpDir);
    expect(loaded.name).toBe('round-trip');
    expect(loaded.width).toBe(1080);
    expect(loaded.height).toBe(1080);
  });

  test('load throws PROJECT_NOT_FOUND when file missing', async () => {
    await expect(load(tmpDir)).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' });
  });

  test('exists returns false when no project file', async () => {
    expect(await exists(tmpDir)).toBe(false);
  });

  test('exists returns true after save', async () => {
    const data = createProjectData({ name: 'exists-test' });
    await save(tmpDir, data);
    expect(await exists(tmpDir)).toBe(true);
  });
});
