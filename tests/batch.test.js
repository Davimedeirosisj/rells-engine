import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { listProjects } from '../backend/projects.js';
import { config } from '../backend/config.js';
import { cancelBatch, generateAllCuts } from '../backend/worker/batch.js';
import { getProgress } from '../backend/progress.js';

const projectsDir = config.dirs.projects;

function fakeCut(id, status) {
  return {
    id,
    status: status || 'PENDENTE',
    start: '00:00:00,000',
    end: '00:00:10,000',
    startMs: 0,
    endMs: 10000,
    theme: 'TEMA',
    title: `Corte ${id}`,
  };
}

function fakeProcessor({ failOn }) {
  return async (dir, manifest, cut) => {
    if (failOn.includes(cut.id)) {
      cut.status = 'ERRO';
      cut.error = 'falha simulada';
      return cut;
    }
    cut.status = 'CONCLUÍDO';
    cut.output = `cut-${cut.id}.mp4`;
    return cut;
  };
}

async function withProject({ cuts, fontAvailable }) {
  const name = '__batch_proj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
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

  const originalFont = config.fontPath;
  const tempFont = path.join(path.dirname(projectsDir), 'font-test.tmp');
  if (fontAvailable) await fs.writeFile(tempFont, 'fake');
  config.fontPath = tempFont;

  try {
    const result = await generateAllCuts(name, fakeProcessor({ failOn: [] }));
    const manifestSaved = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'));
    return { name, result, manifestSaved };
  } finally {
    config.fontPath = originalFont;
    await fs.rm(dir, { recursive: true, force: true });
    await fs.rm(tempFont, { force: true }).catch(() => {});
  }
}

test('lote ignora cortes já concluídos e processa o restante', async () => {
  const { result, manifestSaved } = await withProject({
    cuts: [fakeCut(1, 'CONCLUÍDO'), fakeCut(2), fakeCut(3)],
    fontAvailable: true,
  });

  assert.equal(result.results.total, 3);
  assert.equal(result.results.skipped, 1);
  assert.equal(result.results.completed, 2);
  assert.equal(result.results.failed, 0);
  assert.equal(manifestSaved.cuts[1].status, 'CONCLUÍDO');
  assert.equal(manifestSaved.cuts[2].status, 'CONCLUÍDO');
});

test('falha em um corte não impede o processamento dos demais', async () => {
  const name = '__batch_proj_' + Date.now();
  const dir = path.join(projectsDir, name);
  await fs.mkdir(path.join(dir, 'output'), { recursive: true });
  await fs.mkdir(path.join(dir, 'temp'), { recursive: true });
  await fs.writeFile(
    path.join(dir, 'manifest.json'),
    JSON.stringify({
      project: name,
      sourceVideo: 'original.mp4',
      importedAt: new Date().toISOString(),
      cuts: [fakeCut(1), fakeCut(2), fakeCut(3)],
      validationErrors: [],
    }),
  );

  const originalFont = config.fontPath;
  const tempFont = path.join(path.dirname(projectsDir), 'font-test.tmp');
  await fs.writeFile(tempFont, 'fake');
  config.fontPath = tempFont;

  try {
    const result = await generateAllCuts(name, fakeProcessor({ failOn: [2] }));
    assert.equal(result.results.total, 3);
    assert.equal(result.results.completed, 2);
    assert.equal(result.results.failed, 1);
    const byId = Object.fromEntries(result.results.cuts.map((c) => [c.id, c.status]));
    assert.equal(byId[1], 'CONCLUÍDO');
    assert.equal(byId[2], 'ERRO');
    assert.equal(byId[3], 'CONCLUÍDO');
    assert.ok(result.results.cuts.find((c) => c.id === 2).error);
  } finally {
    config.fontPath = originalFont;
    await fs.rm(dir, { recursive: true, force: true });
    await fs.rm(tempFont, { force: true }).catch(() => {});
  }
});

test('lote salva o manifest a cada corte processado', async () => {
  const { result } = await withProject({
    cuts: [fakeCut(1), fakeCut(2)],
    fontAvailable: true,
  });
  assert.equal(result.results.completed, 2);
});

test('lote marca corte como ERRO se a fonte não existe', async () => {
  const name = '__batch_proj_' + Date.now() + '_font_' + Math.random().toString(36).slice(2, 7);
  const dir = path.join(projectsDir, name);
  await fs.mkdir(path.join(dir, 'output'), { recursive: true });
  await fs.mkdir(path.join(dir, 'temp'), { recursive: true });
  await fs.writeFile(
    path.join(dir, 'manifest.json'),
    JSON.stringify({
      project: name,
      sourceVideo: 'original.mp4',
      importedAt: new Date().toISOString(),
      cuts: [fakeCut(1)],
      validationErrors: [],
    }),
  );

  const originalFont = config.fontPath;
  const originalWindir = process.env.WINDIR;
  config.fontPath = path.join(path.dirname(projectsDir), 'font-inexistente.tmp');
  process.env.WINDIR = path.join(path.dirname(projectsDir), 'windir-inexistente');
  try {
    const { results } = await generateAllCuts(name);
    assert.equal(results.total, 1);
    assert.equal(results.failed, 1);
    assert.equal(results.cuts[0].status, 'ERRO');
    assert.match(results.cuts[0].error, /Nenhuma fonte/);
    const manifestSaved = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'));
    assert.equal(manifestSaved.cuts[0].status, 'ERRO');
  } finally {
    process.env.WINDIR = originalWindir;
    config.fontPath = originalFont;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('lote não reprocessa cortes em PROCESSANDO', async () => {
  const { result } = await withProject({
    cuts: [fakeCut(1, 'PROCESSANDO'), fakeCut(2)],
    fontAvailable: true,
  });
  assert.equal(result.results.cuts.length, 1);
  assert.equal(result.results.cuts[0].id, 2);
  assert.equal(result.results.completed, 1);
});

test('lote rejeita execução concorrente para o mesmo projeto', async () => {
  const name = '__batch_proj_' + Date.now() + '_lock_' + Math.random().toString(36).slice(2, 7);
  const dir = path.join(projectsDir, name);
  await fs.mkdir(path.join(dir, 'output'), { recursive: true });
  await fs.mkdir(path.join(dir, 'temp'), { recursive: true });
  await fs.writeFile(
    path.join(dir, 'manifest.json'),
    JSON.stringify({
      project: name,
      sourceVideo: 'original.mp4',
      importedAt: new Date().toISOString(),
      cuts: [fakeCut(1)],
      validationErrors: [],
    }),
  );

  let release;
  const processorStarted = new Promise((resolve) => { release = resolve; });
  const processor = async (_dir, _manifest, cut) => {
    await processorStarted;
    cut.status = 'CONCLUÍDO';
    return cut;
  };

  try {
    const first = generateAllCuts(name, processor);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await assert.rejects(
      () => generateAllCuts(name, processor),
      /processamento em andamento/,
    );
    release();
    await first;
  } finally {
    release?.();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('lote pode ser cancelado e publica estado CANCELLED', async () => {
  const name = '__batch_proj_' + Date.now() + '_cancel_' + Math.random().toString(36).slice(2, 7);
  const dir = path.join(projectsDir, name);
  await fs.mkdir(path.join(dir, 'output'), { recursive: true });
  await fs.mkdir(path.join(dir, 'temp'), { recursive: true });
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify({
    project: name,
    sourceVideo: 'original.mp4',
    importedAt: new Date().toISOString(),
    cuts: [fakeCut(1)],
    validationErrors: [],
  }));

  try {
    const running = generateAllCuts(name, async (_dir, _manifest, cut, _index, progress) => (
      new Promise((resolve) => {
        progress.signal.addEventListener('abort', () => {
          cut.status = 'ERRO';
          cut.error = 'cancelado';
          resolve(cut);
        }, { once: true });
      })
    ));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(cancelBatch(name), true);
    const result = await running;
    assert.equal(getProgress(name).status, 'CANCELLED');
    assert.equal(result.results.total, 1);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});