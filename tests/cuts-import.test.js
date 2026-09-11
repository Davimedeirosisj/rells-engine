import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { importCutsIntoProject } from '../backend/project.js';
import { getProject } from '../backend/projects.js';
import { config } from '../backend/config.js';
import { generateAllCuts } from '../backend/worker/batch.js';
import { createApp } from '../backend/server.js';

const projectsDir = config.dirs.projects;
const SRT_TEXT = [
  '1',
  '00:00:00,000 --> 00:00:10,000',
  'Fala um.',
  '',
  '2',
  '00:00:10,000 --> 00:00:20,000',
  'Fala dois.',
  '',
  '3',
  '00:00:20,000 --> 00:00:30,000',
  'Fala três.',
  '',
].join('\n');

function baseCut(overrides = {}) {
  return {
    id: 1,
    start: '00:00:02,000',
    end: '00:00:08,000',
    title: 'Corte 1',
    theme: 'Tema 1',
    cover_hook: 'Hook 1',
    speech: 'Fala um.',
    ...overrides,
  };
}

function cortesJson(cuts) {
  return JSON.stringify({ project: { name: 'ignorado' }, preset: 'padrão', cuts });
}

async function makeProject({ srt = SRT_TEXT, durationMs = 30000 } = {}) {
  const name = '__imp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const dir = path.join(projectsDir, name);
  await fs.mkdir(path.join(dir, 'output'), { recursive: true });
  await fs.mkdir(path.join(dir, 'temp'), { recursive: true });
  await fs.writeFile(path.join(dir, 'original.mp4'), Buffer.from('fake-video-bytes'));
  await fs.writeFile(path.join(dir, 'original.srt'), srt);
  await fs.writeFile(
    path.join(dir, 'manifest.json'),
    JSON.stringify({
      project: name,
      sourceVideo: 'original.mp4',
      videoDurationMs: durationMs,
      cuts: [],
      validationErrors: [],
      importedAt: new Date().toISOString(),
    }),
  );
  return { name, dir };
}

async function rmProject(name) {
  await fs.rm(path.join(projectsDir, name), { recursive: true, force: true });
}

async function importOk(name, cuts) {
  return importCutsIntoProject(name, cortesJson(cuts));
}

test('importCutsIntoProject rejeita projeto inexistente', async () => {
  await assert.rejects(() => importCutsIntoProject('nao_existe_999_xyz', '{}'), /não encontrado/);
});

test('importCutsIntoProject rejeita JSON malformado', async () => {
  const { name } = await makeProject();
  try {
    await assert.rejects(() => importCutsIntoProject(name, 'nao é json'), /JSON válido/);
  } finally {
    await rmProject(name);
  }
});

test('importCutsIntoProject rejeita estrutura sem a lista "cuts"', async () => {
  const { name } = await makeProject();
  try {
    await assert.rejects(() => importCutsIntoProject(name, JSON.stringify({ project: { name: 'x' } })), /"cuts"/);
  } finally {
    await rmProject(name);
  }
});

test('importCutsIntoProject rejeita lista de cortes vazia', async () => {
  const { name } = await makeProject();
  try {
    await assert.rejects(() => importCutsIntoProject(name, cortesJson([])), /não possui cortes na lista/);
  } finally {
    await rmProject(name);
  }
});

test('corte com start inválido gera erro de validação', async () => {
  const { name } = await makeProject();
  try {
    const r = await importOk(name, [baseCut({ start: 'dez' })]);
    assert.equal(r.valid, 0);
    assert.equal(r.errors.length, 1);
    assert.match(r.errors[0], /timestamp de início inválido/);
  } finally {
    await rmProject(name);
  }
});

test('corte com end inválido gera erro de validação', async () => {
  const { name } = await makeProject();
  try {
    const r = await importOk(name, [baseCut({ end: 'treze' })]);
    assert.equal(r.valid, 0);
    assert.match(r.errors[0], /timestamp de fim inválido/);
  } finally {
    await rmProject(name);
  }
});

test('início maior ou igual ao fim é inválido', async () => {
  const { name } = await makeProject();
  try {
    const r = await importOk(name, [baseCut({ start: '00:00:10,000', end: '00:00:08,000' })]);
    assert.equal(r.valid, 0);
    assert.match(r.errors[0], /maior ou igual ao fim/);
  } finally {
    await rmProject(name);
  }
});

test('início 00:00:00,000 é aceito', async () => {
  const { name } = await makeProject();
  try {
    const r = await importOk(name, [baseCut({ start: '00:00:00,000' })]);
    assert.equal(r.valid, 1);
    assert.equal(r.errors.length, 0);
  } finally {
    await rmProject(name);
  }
});

test('timestamps negativos são inválidos', async () => {
  const { name } = await makeProject();
  try {
    const r = await importOk(name, [baseCut({ start: -1 })]);
    assert.equal(r.valid, 0);
    assert.match(r.errors[0], /negativos/);
  } finally {
    await rmProject(name);
  }
});

test('corte além da duração do vídeo é inválido', async () => {
  const { name } = await makeProject({ durationMs: 30000 });
  try {
    const r = await importOk(name, [baseCut({ end: '00:00:35,000' })]);
    assert.equal(r.valid, 0);
    assert.ok(r.errors.some((e) => /além da duração/.test(e)));
  } finally {
    await rmProject(name);
  }
});

test('corte dentro da duração mas fora do intervalo do SRT é inválido', async () => {
  const { name } = await makeProject({ durationMs: 60000 });
  try {
    const r = await importOk(name, [baseCut({ start: '00:00:40,000', end: '00:00:45,000' })]);
    assert.equal(r.valid, 0);
    assert.ok(r.errors.some((e) => /fora do intervalo do SRT/.test(e)));
  } finally {
    await rmProject(name);
  }
});

test('srt_block sem correspondência no original.srt gera erro', async () => {
  const { name } = await makeProject();
  try {
    const r = await importOk(name, [baseCut({ srt_block: 'fala que não existe na legenda' })]);
    assert.equal(r.valid, 0);
    assert.match(r.errors[0], /não corresponde ao original\.srt/);
  } finally {
    await rmProject(name);
  }
});

test('speech_timestamps fora do corte geram erro e válidos são preservados', async () => {
  const { name } = await makeProject();
  try {
    const r = await importOk(name, [
      baseCut({ speech_timestamps: ['00:00:03,000', '00:00:50,000'] }),
    ]);
    assert.equal(r.valid, 1);
    assert.equal(r.errors.length, 1);
    assert.match(r.errors[0], /fora do intervalo do corte/);
    const { manifest } = await getProject(name);
    assert.ok(manifest.cuts[0].speech_timestamps.includes('00:00:03,000'));
  } finally {
    await rmProject(name);
  }
});

test('projeto sem original.srt rejeita a importação', async () => {
  const { name, dir } = await makeProject();
  try {
    await fs.rm(path.join(dir, 'original.srt'));
    await assert.rejects(() => importOk(name, [baseCut()]), /não possui original\.srt/);
  } finally {
    await rmProject(name);
  }
});

test('projeto sem vídeo original rejeita a importação', async () => {
  const { name, dir } = await makeProject();
  try {
    await fs.rm(path.join(dir, 'original.mp4'));
    await assert.rejects(() => importOk(name, [baseCut()]), /vídeo original/);
  } finally {
    await rmProject(name);
  }
});

test('cortes válidos importam e persistem no manifest sem FFmpeg', async () => {
  const { name, dir } = await makeProject();
  try {
    const r = await importOk(name, [
      baseCut({ id: 1, speech: 'Fala um.' }),
      baseCut({ id: 2, start: '00:00:11,000', end: '00:00:17,000', title: 'Corte 2', theme: 'Tema 2' }),
      baseCut({ id: 3, start: '00:00:22,000', end: '00:00:28,000', title: 'Corte 3', theme: 'Tema 3', srt_block: 'Fala três.' }),
    ]);
    assert.equal(r.total, 3);
    assert.equal(r.valid, 3);
    assert.equal(r.errors.length, 0);

    const { manifest } = await getProject(name);
    assert.equal(manifest.cuts.length, 3);
    assert.equal(manifest.validationErrors.length, 0);
    assert.ok(manifest.cutsImportedAt);
    for (const c of manifest.cuts) {
      assert.equal(c.status, 'PENDENTE');
      assert.ok(c.id && c.start && c.end && c.title && c.theme && c.cover_hook);
    }
    assert.equal(manifest.cuts[2].srt_block, 'Fala três.');

    const savedCortes = JSON.parse(await fs.readFile(path.join(dir, 'cortes.json'), 'utf8'));
    assert.equal(savedCortes.cuts.length, 3);
  } finally {
    await rmProject(name);
  }
});

test('importação não executa FFmpeg (saída vazia, cortes PENDENTE)', async () => {
  const { name, dir } = await makeProject();
  try {
    await importOk(name, [baseCut(), baseCut({ id: 2, start: '00:00:12,000', end: '00:00:16,000', title: 'T2', theme: 'Tema', cover_hook: 'H' })]);
    const outputFiles = await fs.readdir(path.join(dir, 'output'));
    const tempFiles = await fs.readdir(path.join(dir, 'temp'));
    assert.equal(outputFiles.length, 0);
    assert.equal(tempFiles.length, 0);
    const { manifest } = await getProject(name);
    for (const c of manifest.cuts) {
      assert.equal(c.status, 'PENDENTE');
      assert.equal(c.output, undefined);
    }
  } finally {
    await rmProject(name);
  }
});

test('processamento posterior segue funcionando (generate-all após importação)', async () => {
  const { name } = await makeProject();
  const originalFont = config.fontPath;
  const fakeFont = path.join(path.dirname(projectsDir), 'font-import-test.tmp');
  await fs.writeFile(fakeFont, 'fake');
  config.fontPath = fakeFont;
  try {
    const r = await importOk(name, [
      baseCut(),
      baseCut({ id: 2, start: '00:00:12,000', end: '00:00:16,000', title: 'T2', theme: 'Tema', cover_hook: 'H' }),
    ]);
    assert.equal(r.valid, 2);

    const fakeProcessor = async (_dir, _manifest, cut) => {
      cut.status = 'CONCLUÍDO';
      cut.output = `cut-${cut.id}.mp4`;
      return cut;
    };
    const { results } = await generateAllCuts(name, fakeProcessor);
    assert.equal(results.total, 2);
    assert.equal(results.completed, 2);
    assert.equal(results.failed, 0);

    const { manifest } = await getProject(name);
    assert.equal(manifest.cuts[0].status, 'CONCLUÍDO');
    assert.equal(manifest.cuts[1].status, 'CONCLUÍDO');
  } finally {
    config.fontPath = originalFont;
    await fs.rm(fakeFont, { force: true }).catch(() => {});
    await rmProject(name);
  }
});

// ---- Endpoint HTTP ----
let server;
let base = '';

before(async () => {
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

async function api(method, url, fields) {
  const opts = { method, headers: {} };
  if (fields) {
    const form = new FormData();
    for (const [name, { filename, content, type }] of Object.entries(fields)) {
      form.append(name, new Blob([content], { type }), filename);
    }
    opts.body = form;
  }
  const res = await fetch(base + url, opts);
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

test('POST /api/projects/:name/cuts/import sem arquivo retorna 400', async () => {
  const { status, data } = await api('POST', '/api/projects/x/cuts/import', {});
  assert.equal(status, 400);
  assert.match(data.error, /não enviado/);
});

test('POST /api/projects/:name/cuts/import com projeto inexistente retorna 400', async () => {
  const { status, data } = await api('POST', '/api/projects/nao_existe_123_xyz/cuts/import', {
    cortes: { filename: 'c.json', type: 'application/json', content: cortesJson([baseCut()]) },
  });
  assert.equal(status, 400);
  assert.match(data.error, /não encontrado/);
});

test('POST /api/projects/:name/cuts/import bloqueia path traversal', async () => {
  const { status, data } = await api('POST', `/api/projects/${encodeURIComponent('../escape')}/cuts/import`, {
    cortes: { filename: 'c.json', type: 'application/json', content: cortesJson([baseCut()]) },
  });
  assert.equal(status, 400);
  assert.match(data.error, /path traversal/i);
});

test('POST /api/projects/:name/cuts/import importa cortes válidos', async () => {
  const { name } = await makeProject();
  try {
    const { status, data } = await api('POST', `/api/projects/${encodeURIComponent(name)}/cuts/import`, {
      cortes: {
        filename: 'c.json',
        type: 'application/json',
        content: cortesJson([baseCut(), baseCut({ id: 2, start: '00:00:12,000', end: '00:00:16,000', title: 'T2', theme: 'Tema', cover_hook: 'H' })]),
      },
    });
    assert.equal(status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.cuts.total, 2);
    assert.equal(data.cuts.valid, 2);
    assert.equal(data.cuts.errors.length, 0);
  } finally {
    await rmProject(name);
  }
});

test('POST /api/projects/:name/cuts/import retorna ok:false com erros de validação', async () => {
  const { name } = await makeProject();
  try {
    const { status, data } = await api('POST', `/api/projects/${encodeURIComponent(name)}/cuts/import`, {
      cortes: {
        filename: 'c.json',
        type: 'application/json',
        content: cortesJson([baseCut({ start: '00:00:10,000', end: '00:00:08,000' })]),
      },
    });
    assert.equal(status, 200);
    assert.equal(data.ok, false);
    assert.equal(data.cuts.total, 1);
    assert.equal(data.cuts.valid, 0);
    assert.equal(data.cuts.errors.length, 1);
  } finally {
    await rmProject(name);
  }
});

test('POST /api/projects/:name/cuts/import com JSON malformado retorna 400', async () => {
  const { name } = await makeProject();
  try {
    const { status } = await api('POST', `/api/projects/${encodeURIComponent(name)}/cuts/import`, {
      cortes: { filename: 'c.json', type: 'application/json', content: 'não é json' },
    });
    assert.equal(status, 400);
  } finally {
    await rmProject(name);
  }
});