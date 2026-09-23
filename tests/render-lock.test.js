import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../backend/config.js';
import { generateCut } from '../backend/worker/cut.js';
import { generateAllCuts } from '../backend/worker/batch.js';

const projectsDir = config.dirs.projects;

test('individual cut is rejected while a batch renders the same project', async () => {
  const name = '__render_lock_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const dir = path.join(projectsDir, name);
  await fs.mkdir(path.join(dir, 'output'), { recursive: true });
  await fs.mkdir(path.join(dir, 'temp'), { recursive: true });
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify({
    project: name,
    sourceVideo: 'original.mp4',
    cuts: [{ id: 1, startMs: 0, endMs: 1000, start: 'x', end: 'y', title: 'T', theme: 'Tema', status: 'PENDENTE' }],
    validationErrors: [],
  }));

  let release;
  const waiting = new Promise((resolve) => { release = resolve; });
  const batch = generateAllCuts(name, async (_dir, _manifest, cut) => {
    await waiting;
    cut.status = 'CONCLUÍDO';
    return cut;
  });

  try {
    await new Promise((resolve) => setImmediate(resolve));
    await assert.rejects(() => generateCut(name, 1), /em andamento/);
  } finally {
    release();
    await batch;
    await fs.rm(dir, { recursive: true, force: true });
  }
});
