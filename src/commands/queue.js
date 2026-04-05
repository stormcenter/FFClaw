/**
 * `clipcraft queue` — manage the export job queue.
 *
 * Sub-commands:
 *   queue list                       List queued / completed jobs
 *   queue add                         Add a render job to the queue
 *   queue remove  <id>               Remove a job from the queue
 *   queue clear                       Clear all queued jobs
 *   queue start                       Start processing the queue
 *   queue status  [id]               Show status of a specific job
 *
 * The queue is stored in the project file under the `jobs` key.
 * Each job tracks its status, parameters, and output path.
 *
 * @module commands/queue
 */

import path from 'node:path';
import { load, save, resolveProjectDir } from '../core/project.js';
import { TimelineModel } from '../core/timeline-model.js';
import { build } from '../core/builder.js';
import { run } from '../render/export-runner.js';
import { print, ok, error, Errors, progress } from '../utils/output.js';
import { ProgressReporter } from '../render/progress-reporter.js';

// Job statuses
const JOB_STATUS = {
  PENDING:  'pending',
  RUNNING:  'running',
  DONE:     'done',
  FAILED:   'failed',
  CANCELLED: 'cancelled',
};

/** @typedef {typeof JOB_STATUS[keyof typeof JOB_STATUS]} JobStatus */

// ── Yargs command definition ──────────────────────────────────────────────────

export const command = 'queue <subcommand>';
export const desc    = 'Manage the export job queue';

export function builder(yargs) {
  return yargs
    // ── queue list ───────────────────────────────────────────────────────────
    .command({
      command: 'list',
      desc: 'List all queued and completed jobs',
      handler: handleList,
    })
    // ── queue add ────────────────────────────────────────────────────────────
    .command({
      command: 'add',
      desc: 'Add a render job to the queue',
      builder: (y) =>
        y
          .option('name', {
            alias: 'n',
            type: 'string',
            description: 'Job name (for display)',
          })
          .option('output', {
            alias: 'o',
            type: 'string',
            description: 'Output file path',
          })
          .option('crf', {
            type: 'number',
            description: 'CRF quality value (default: 23)',
          })
          .option('preset', {
            type: 'string',
            description: 'Encoding preset (e.g. fast, slow)',
          })
          .option('width', {
            type: 'number',
            description: 'Output width in pixels',
          })
          .option('height', {
            type: 'number',
            description: 'Output height in pixels',
          })
          .option('fps', {
            type: 'number',
            description: 'Output frame rate',
          })
          .option('format', {
            alias: 'f',
            type: 'string',
            description: 'Output format (mp4, mkv, webm, gif)',
            default: 'mp4',
          })
          .example('$0 queue add --name "Main" --output ./output.mp4', 'Queue a render job')
          .example('$0 queue add --output ./720p.mp4 --width 1280 --height 720', 'Queue a 720p render'),
      handler: handleAdd,
    })
    // ── queue remove ─────────────────────────────────────────────────────────
    .command({
      command: 'remove <id>',
      desc: 'Remove a job from the queue',
      builder: (y) =>
        y.positional('id', { type: 'string', description: 'Job ID (e.g. j1)' }),
      handler: handleRemove,
    })
    // ── queue clear ──────────────────────────────────────────────────────────
    .command({
      command: 'clear',
      desc: 'Clear all queued jobs (not running jobs)',
      builder: (y) =>
        y.option('yes', {
          alias: 'y',
          type: 'boolean',
          description: 'Skip confirmation',
          default: false,
        }),
      handler: handleClear,
    })
    // ── queue start ───────────────────────────────────────────────────────────
    .command({
      command: 'start',
      desc: 'Start processing queued jobs (runs sequentially)',
      builder: (y) =>
        y
          .option('parallel', {
            alias: 'p',
            type: 'number',
            description: 'Number of parallel render processes (default: 1)',
            default: 1,
          })
          .option('jobs', {
            alias: 'j',
            type: 'string',
            description: 'Comma-separated job IDs to process (default: all pending)',
          })
          .example('$0 queue start', 'Process all pending jobs sequentially')
          .example('$0 queue start --parallel 2', 'Process up to 2 jobs in parallel'),
      handler: handleStart,
    })
    // ── queue status ────────────────────────────────────────────────────────
    .command({
      command: 'status [id]',
      desc: 'Show status of a specific job or overall queue',
      builder: (y) =>
        y.positional('id', { type: 'string', description: 'Job ID (optional)' }),
      handler: handleStatus,
    })
    .demandCommand(1, 'Please specify a queue sub-command.')
    .example('$0 queue list', 'Show all queued jobs')
    .example('$0 queue add --name "720p" --output ./720p.mp4', 'Add a job');
}

export default { command, desc, builder, handler: () => {} };

// ── Sub-command handlers ─────────────────────────────────────────────────────

/** Handle `queue list` */
async function handleList(argv) {
  const opts = { json: argv.json, quiet: argv.quiet };
  const dir  = resolveProjectDir(argv.project);

  let projectData;
  try {
    projectData = await load(dir);
  } catch (err) {
    handleLoadError(err, dir, opts);
  }

  const jobs = projectData.jobs ?? [];

  if (opts.json) {
    for (const job of jobs) {
      print({ type: 'job', ...job }, opts);
    }
    return;
  }

  if (jobs.length === 0) {
    print('Queue is empty.  Use `clipcraft queue add` to add a render job.', opts);
    return;
  }

  print('\n  RENDER QUEUE', opts);
  print('  ' + '─'.repeat(75), opts);
  print(`  ${'ID'.padEnd(4)}  ${'NAME'.padEnd(20)}  ${'STATUS'.padEnd(12)}  ${'OUTPUT'}`, opts);
  print('  ' + '─'.repeat(75), opts);

  for (const job of jobs) {
    const name    = (job.name ?? 'unnamed').padEnd(20);
    const status  = job.status.padEnd(12);
    const outFile = job.output ?? '(no output)';
    const statusColor = statusColorFor(job.status);
    print(`  ${job.id.padEnd(4)}  ${name}  ${statusColor}  ${outFile}`, opts);
  }

  print('', opts);

  const counts = jobs.reduce((acc, j) => {
    acc[j.status] = (acc[j.status] ?? 0) + 1;
    return acc;
  }, /** @type {Record<string, number>} */ ({}));

  const parts = Object.entries(counts).map(([s, n]) => `${n} ${s}`);
  print(`  Summary: ${parts.join(', ')}`, opts);
  print('', opts);
}

/** Handle `queue add` */
async function handleAdd(argv) {
  const opts = { json: argv.json, quiet: argv.quiet };
  const dir  = resolveProjectDir(argv.project);

  let projectData;
  try {
    projectData = await load(dir);
  } catch (err) {
    handleLoadError(err, dir, opts);
  }

  // Validate we have clips
  const model = new TimelineModel(projectData.timeline);
  if (model.getDuration() === 0) {
    error(Errors.INVALID_PROJECT, 'The timeline has no clips. Add clips before queuing a render.', opts);
  }

  const jobs     = projectData.jobs ?? [];
  const jobNum   = (jobs.map((j) => parseInt(j.id.slice(1), 10) || 0).reduce((m, n) => Math.max(m, n), 0)) + 1;
  const jobId    = `j${jobNum}`;
  const format   = argv.format ?? 'mp4';
  const defaultOutput = path.join(dir, `output_${jobId}.${format}`);

  const job = {
    id:      jobId,
    name:    argv.name ?? `Job ${jobId}`,
    status:  JOB_STATUS.PENDING,
    output:  argv.output ?? defaultOutput,
    createdAt: new Date().toISOString(),
    params:  {
      crf:    argv.crf,
      preset: argv.preset,
      width:  argv.width,
      height: argv.height,
      fps:    argv.fps,
      format,
    },
    startedAt:  null,
    completedAt: null,
    error:       null,
  };

  jobs.push(job);
  projectData.jobs = jobs;
  await save(dir, projectData);

  print(`Queued job ${jobId}: "${job.name}" → ${job.output}`, opts);
  ok({ op: 'queue-add', jobId, name: job.name, output: job.output }, opts);
}

/** Handle `queue remove <id>` */
async function handleRemove(argv) {
  const opts  = { json: argv.json, quiet: argv.quiet };
  const dir   = resolveProjectDir(argv.project);
  const jobId = argv.id;

  let projectData;
  try {
    projectData = await load(dir);
  } catch (err) {
    handleLoadError(err, dir, opts);
  }

  const jobs = projectData.jobs ?? [];
  const idx  = jobs.findIndex((j) => j.id === jobId);

  if (idx === -1) {
    error(Errors.JOB_NOT_FOUND, `Job '${jobId}' not found in queue`, opts);
  }

  const job = jobs[idx];
  if (job.status === JOB_STATUS.RUNNING) {
    error(Errors.JOB_IN_PROGRESS, `Job '${jobId}' is currently running. Use 'queue cancel ${jobId}' first.`, opts);
  }

  jobs.splice(idx, 1);
  projectData.jobs = jobs;
  await save(dir, projectData);

  print(`Removed job ${jobId}`, opts);
  ok({ op: 'queue-remove', jobId }, opts);
}

/** Handle `queue clear` */
async function handleClear(argv) {
  const opts = { json: argv.json, quiet: argv.quiet };
  const dir  = resolveProjectDir(argv.project);

  if (!argv.yes && process.stdin.isTTY) {
    const { createInterface } = await import('node:readline/promises');
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = (await rl.question('Clear all queued jobs? [y/N] ')).trim();
    rl.close();
    if (!/^y(es)?$/i.test(answer)) {
      print('Cancelled.', opts);
      return;
    }
  }

  let projectData;
  try {
    projectData = await load(dir);
  } catch (err) {
    handleLoadError(err, dir, opts);
  }

  const jobs        = projectData.jobs ?? [];
  const nonPending  = jobs.filter((j) => j.status === JOB_STATUS.RUNNING);
  const toRemove    = jobs.filter((j) => j.status !== JOB_STATUS.RUNNING);

  if (nonPending.length > 0) {
    print(`Skipped ${nonPending.length} running/completed job(s).`, opts);
  }

  projectData.jobs = nonPending;
  await save(dir, projectData);

  print(`Cleared ${toRemove.length} queued job(s)`, opts);
  ok({ op: 'queue-clear', removed: toRemove.length }, opts);
}

/** Handle `queue start` */
async function handleStart(argv) {
  const opts     = { json: argv.json, quiet: argv.quiet };
  const dir      = resolveProjectDir(argv.project);
  const parallel = Math.max(1, Number(argv.parallel));

  let projectData;
  try {
    projectData = await load(dir);
  } catch (err) {
    handleLoadError(err, dir, opts);
  }

  const model = new TimelineModel(projectData.timeline);
  if (model.getDuration() === 0) {
    error(Errors.INVALID_PROJECT, 'The timeline has no clips. Add clips before rendering.', opts);
  }

  // Select jobs to run
  let jobs = (projectData.jobs ?? []).filter((j) => j.status === JOB_STATUS.PENDING);

  if (argv.jobs) {
    const ids = argv.jobs.split(',').map((s) => s.trim());
    jobs = jobs.filter((j) => ids.includes(j.id));
  }

  if (jobs.length === 0) {
    print('No pending jobs to process.', opts);
    return;
  }

  const total = jobs.length;
  let completed = 0;
  let failed    = 0;

  print(`Starting queue: ${total} job(s) (parallel=${parallel})…`, opts);

  for (const job of jobs) {
    // Update job status to running
    const jobsInFile = projectData.jobs ?? [];
    const jIdx = jobsInFile.findIndex((j) => j.id === job.id);
    if (jIdx !== -1) {
      jobsInFile[jIdx].status     = JOB_STATUS.RUNNING;
      jobsInFile[jIdx].startedAt  = new Date().toISOString();
    }
    projectData.jobs = jobsInFile;
    await save(dir, projectData);

    print(`[${completed + failed + 1}/${total}] Running job ${job.id}: "${job.name}"`, opts);

    try {
      await runJob(job, projectData, dir, parallel, opts);
      // Mark done
      const after = projectData.jobs ?? [];
      const aIdx  = after.findIndex((j) => j.id === job.id);
      if (aIdx !== -1) {
        after[aIdx].status      = JOB_STATUS.DONE;
        after[aIdx].completedAt = new Date().toISOString();
      }
      completed++;
    } catch (err) {
      // Mark failed
      const after = projectData.jobs ?? [];
      const aIdx  = after.findIndex((j) => j.id === job.id);
      if (aIdx !== -1) {
        after[aIdx].status      = JOB_STATUS.FAILED;
        after[aIdx].completedAt = new Date().toISOString();
        after[aIdx].error       = err.message;
      }
      failed++;
      print(`Job ${job.id} failed: ${err.message}`, opts);
    }

    projectData.jobs = after;
    await save(dir, projectData);
  }

  print(`\nQueue complete: ${completed} done, ${failed} failed`, opts);
  ok({ op: 'queue-complete', total, completed, failed }, opts);
}

/** Handle `queue status [id]` */
async function handleStatus(argv) {
  const opts  = { json: argv.json, quiet: argv.quiet };
  const dir   = resolveProjectDir(argv.project);

  let projectData;
  try {
    projectData = await load(dir);
  } catch (err) {
    handleLoadError(err, dir, opts);
  }

  const jobs = projectData.jobs ?? [];

  if (argv.id) {
    const job = jobs.find((j) => j.id === argv.id);
    if (!job) {
      error(Errors.JOB_NOT_FOUND, `Job '${argv.id}' not found`, opts);
    }

    if (opts.json) {
      print({ type: 'job-status', ...job }, opts);
      return;
    }

    print(`\n  Job ${job.id}: "${job.name}"`, opts);
    print('  ' + '─'.repeat(60), opts);
    print(`  Status:     ${job.status}`, opts);
    print(`  Output:     ${job.output ?? '(none)'}`, opts);
    print(`  Created:    ${job.createdAt}`, opts);
    if (job.startedAt)   print(`  Started:    ${job.startedAt}`, opts);
    if (job.completedAt) print(`  Completed:  ${job.completedAt}`, opts);
    if (job.error)       print(`  Error:      ${job.error}`, opts);
    if (job.params?.crf) print(`  Params:     crf=${job.params.crf}, preset=${job.params.preset ?? 'default'}`, opts);
    print('', opts);
    return;
  }

  // Overall queue summary
  const pending  = jobs.filter((j) => j.status === JOB_STATUS.PENDING).length;
  const running  = jobs.filter((j) => j.status === JOB_STATUS.RUNNING).length;
  const done    = jobs.filter((j) => j.status === JOB_STATUS.DONE).length;
  const failed  = jobs.filter((j) => j.status === JOB_STATUS.FAILED).length;

  if (opts.json) {
    print({
      type:    'queue-status',
      total:   jobs.length,
      pending,
      running,
      done,
      failed,
    }, opts);
    return;
  }

  print('\n  QUEUE STATUS', opts);
  print('  ' + '─'.repeat(40), opts);
  print(`  Total:    ${jobs.length}`, opts);
  print(`  Pending:  ${pending}`, opts);
  print(`  Running:  ${running}`, opts);
  print(`  Done:     ${done}`, opts);
  print(`  Failed:   ${failed}`, opts);
  print('', opts);
}

// ── Job runner ───────────────────────────────────────────────────────────────

/**
 * Run a single render job.
 *
 * @param {object} job
 * @param {import('../core/project.js').ProjectData} projectData
 * @param {string} dir
 * @param {number} parallel
 * @param {{ json?: boolean, quiet?: boolean }} opts
 * @returns {Promise<void>}
 */
async function runJob(job, projectData, dir, parallel, opts) {
  const params = job.params ?? {};

  // Build output path
  const output = path.resolve(job.output ?? path.join(dir, `output_${job.id}.mp4`));

  // Determine dimensions
  const width  = params.width  ?? projectData.width;
  const height = params.height ?? projectData.height;

  // Build a project data snapshot with the job-specific params
  const jobProjectData = {
    ...projectData,
    width,
    height,
    fps: params.fps ?? projectData.fps,
  };

  const model   = new TimelineModel(projectData.timeline);
  const creator = build(model, jobProjectData, dir, {
    output,
    crf:     params.crf ?? 23,
    preset:  params.preset ?? 'fast',
    audioBitrate: '192k',
  });

  await run(creator, opts);
}

// ── Shared helpers ────────────────────────────────────────────────────────────

/**
 * @param {Error} err
 * @param {string} dir
 * @param {{ json?: boolean, quiet?: boolean }} opts
 */
function handleLoadError(err, dir, opts) {
  if (err.code === 'PROJECT_NOT_FOUND') {
    error(Errors.PROJECT_NOT_FOUND, `No project found at ${dir}.  Run \`clipcraft new\` first.`, opts);
  }
  if (err.code === 'INVALID_PROJECT') {
    error(Errors.INVALID_PROJECT, err.message, opts);
  }
  throw err;
}

/**
 * Return a human-readable colour-coded status string.
 *
 * @param {string} status
 * @returns {string}
 */
function statusColorFor(status) {
  switch (status) {
    case JOB_STATUS.PENDING:   return '⏳ pending';
    case JOB_STATUS.RUNNING:  return '⚡ running';
    case JOB_STATUS.DONE:     return '✅ done';
    case JOB_STATUS.FAILED:   return '❌ failed';
    case JOB_STATUS.CANCELLED: return '🚫 cancelled';
    default: return status;
  }
}
