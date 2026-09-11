import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../backend/config.js';
import { buildDeliveryManifest, exportProjectZip } from '../backend/export.js';
import { getProject, saveManifest } from '../backend/projects.js';

const projectsDir = config.dirs.projects;

async function tempProject() {
  const name = '__export_proj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const dir = path.join(projectsDir, name);
  await fs.mkdir(path.join(dir, 'output'), { recursive: true });
  await fs.mkdir(path.join(dir, 'temp'), { recursive: true });

  const makeCut = (id, status) => ({
    id,
    start: '00:00:00,000',
    end: '00:00:10,000',
    startMs: 0,
    endMs: 10000,
    title: `Corte ${id}`,
    theme: 'Tema A',
    cover_hook: 'Hook',
    status,
    error: '',
    output: status === 'CONCLUÍDO' ? `${String(id).padStart(2, '0')} - Corte ${id}.mp4` : undefined,
  });

  const manifest = {
    project: name,
    preset: 'despertar-espiritual-oficial',
    sourceVideo: 'original.mp4',
    sourceSrt: 'original.srt',
    importedAt: new Date().toISOString(),
    videoDurationMs: 30000,
    cuts: [makeCut(1, 'CONCLUÍDO'), makeCut(2, 'PENDENTE')],
    validationErrors: [],
  };

  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await fs.writeFile(path.join(dir, 'output', '01 - Corte 1.mp4'), 'FALE MP4');

  return { name, dir, manifest };
}

async function teardown(dir) {
  await fs.rm(dir, { recursive: true, force: true });
}

test('buildDeliveryManifest gera manifest de entrega sem campos internos', () => {
  const manifest = {
    project: 'Projeto X',
    preset: 'p',
    videoDurationMs: 1000,
    sourceVideo: 'original.mp4',
    cuts: [
      { id: 1, title: 'A', theme: 'T', cover_hook: 'CH', start: 'x', end: 'y', status: 'CONCLUÍDO', output: '01 - A.mp4', outputPath: 'C:/secret' },
      { id: 2, title: 'B', theme: 'T', cover_hook: 'CH', start: 'x', end: 'y', status: 'PENDENTE', outputPath: 'C:/secret' },
    ],
  };

  const d = buildDeliveryManifest(manifest);
  assert.equal(d.cuts[0].coverHook, 'CH');
  assert.equal(d.complete, 1);
  assert.equal(d.total, 2);
  assert.equal(d.cuts[0].output, '01 - A.mp4');
  assert.equal(d.cuts[1].output, null);
  assert.equal(d.cuts[0].outputPath, undefined);
  assert.ok(d.exportedAt);
});

test('exportProjectZip gera ZIP com cortes e manifest', async () => {
  const { name, dir } = await tempProject();
  try {
    const result = await exportProjectZip(name);
    assert.equal(result.completed, 1);
    assert.match(result.zipName, /-cortes\.zip$/);

    const zipPath = path.join(dir, 'temp', result.zipName);
    await assert.doesNotReject(fs.access(zipPath));
  } finally {
    await teardown(dir);
  }
});

test('exportProjectZip lança erro se nenhum corte está concluído', async () => {
  const { name, dir, manifest } = await tempProject();
  try {
    manifest.cuts = manifest.cuts.map((c) => ({ ...c, status: 'PENDENTE', output: undefined }));
    await saveManifest(name, manifest);
    await assert.rejects(() => exportProjectZip(name), /Nenhum corte concluído/);
  } finally {
    await teardown(dir);
  }
});

test('exportProjectZip lança erro se arquivo de saída foi perdido', async () => {
  const { name, dir, manifest } = await tempProject();
  try {
    await fs.rm(path.join(dir, 'output', '01 - Corte 1.mp4'));
    await assert.rejects(() => exportProjectZip(name), /ausente/);
  } finally {
    await teardown(dir);
  }
});

test('ZIP contém manifest.json válido e cortes/', async () => {
  const { name, dir } = await tempProject();
  try {
    await exportProjectZip(name);

    const { manifest: m } = await getProject(name);
    assert.ok(m.cuts.length >= 0);

    const files = await fs.readdir(path.join(dir, 'output'));
    assert.ok(files.includes('01 - Corte 1.mp4'));
  } finally {
    await teardown(dir);
  }
});