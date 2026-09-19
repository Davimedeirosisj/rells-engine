import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../backend/config.js';
import { generateCut } from '../backend/worker/cut.js';
import { generatePreview } from '../backend/worker/preview.js';

const projectsDir = config.dirs.projects;

async function tempProject(cuts) {
  const name = '__worker_proj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const dir = path.join(projectsDir, name);
  await fs.mkdir(path.join(dir, 'output'), { recursive: true });
  await fs.mkdir(path.join(dir, 'temp'), { recursive: true });
  await fs.writeFile(
    path.join(dir, 'manifest.json'),
    JSON.stringify({
      project: name,
      sourceVideo: 'original.mp4',
      importedAt: new Date().toISOString(),
      cuts,
      validationErrors: [],
    }),
  );
  return name;
}

async function rmProject(name) {
  await fs.rm(path.join(projectsDir, name), { recursive: true, force: true });
}

test('generateCut lança erro para corte inexistente', async () => {
  const name = await tempProject([]);
  await assert.rejects(() => generateCut(name, 99), /não encontrado/);
  await rmProject(name);
});

test('generateCut lança erro para corte em processamento', async () => {
  const name = await tempProject([
    { id: 1, startMs: 0, endMs: 1000, start: 'x', end: 'y', title: 'T', theme: 'Tema', status: 'PROCESSANDO' },
  ]);
  await assert.rejects(() => generateCut(name, 1), /processamento/);
  await rmProject(name);
});

test('generateCut marca ERRO no corte se a fonte não existe', async () => {
  const originalFont = config.fontPath;
  const originalWindir = process.env.WINDIR;
  config.fontPath = path.join(projectsDir, '__inexistente__.ttf');
  process.env.WINDIR = path.join(projectsDir, '__windir_inexistente__');
  const name = await tempProject([
    { id: 1, startMs: 0, endMs: 1000, start: 'x', end: 'y', title: 'T', theme: 'Tema', status: 'PENDENTE' },
  ]);
  try {
    const result = await generateCut(name, 1);
    assert.equal(result.cut.status, 'ERRO');
    assert.match(result.cut.error, /Nenhuma fonte/);
  } finally {
    process.env.WINDIR = originalWindir;
    config.fontPath = originalFont;
    await rmProject(name);
  }
});

test('generateCut salva status ERRO no manifest quando o corte falha', async () => {
  const originalFont = config.fontPath;
  const fakeFont = path.join(projectsDir, '__fonte__.ttf');
  await fs.writeFile(fakeFont, 'fake');
  config.fontPath = fakeFont;
  const name = await tempProject([
    { id: 1, startMs: 0, endMs: 1000, start: 'x', end: 'y', title: 'T', theme: 'Tema', status: 'PENDENTE' },
  ]);
  try {
    await assert.doesNotReject(() => generateCut(name, 1));
    const manifest = JSON.parse(
      await fs.readFile(path.join(projectsDir, name, 'manifest.json'), 'utf8'),
    );
    assert.equal(manifest.cuts[0].status, 'ERRO');
    assert.ok(manifest.cuts[0].error);
  } finally {
    config.fontPath = originalFont;
    await fs.rm(fakeFont, { force: true });
    await rmProject(name);
  }
});

test('generatePreview lança erro para corte inexistente', async () => {
  const name = await tempProject([]);
  await assert.rejects(() => generatePreview(name, 42), /não encontrado/);
  await rmProject(name);
});

test('generatePreview lança erro claro se a fonte não existe', async () => {
  const originalFont = config.fontPath;
  const originalWindir = process.env.WINDIR;
  config.fontPath = path.join(projectsDir, '__inexistente__.ttf');
  process.env.WINDIR = path.join(projectsDir, '__windir_inexistente__');
  const name = await tempProject([
    { id: 1, startMs: 0, endMs: 1000, start: 'x', end: 'y', title: 'T', theme: 'Tema', status: 'PENDENTE' },
  ]);
  try {
    await assert.rejects(() => generatePreview(name, 1), /Nenhuma fonte/);
  } finally {
    process.env.WINDIR = originalWindir;
    config.fontPath = originalFont;
    await rmProject(name);
  }
});