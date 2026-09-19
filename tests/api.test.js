import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createApp } from '../backend/server.js';
import { config } from '../backend/config.js';
import { spawnSync } from 'node:child_process';
import { checkFfmpeg, checkFfprobe, getFfmpegBin } from '../backend/system.js';

const projectsDir = config.dirs.projects;
const TEST_VIDEO = path.join(config.dirs.temp ?? 'temp', 'api-test-video.mp4');
let server;
let base = '';
let ffmpegOk = false;
let ffprobeOk = false;
let createdProject = null;

before(async () => {
  process.env.WHISPER_COMMAND = process.execPath;
  process.env.WHISPER_MODULE = '0';
  const app = createApp();
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;

  const [ff, fp] = await Promise.all([checkFfmpeg(), checkFfprobe()]);
  ffmpegOk = ff.available;
  ffprobeOk = fp.available;
  if (ffmpegOk && ffprobeOk) {
    const res = spawnSync(getFfmpegBin(), [
      '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=25:duration=2',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', TEST_VIDEO,
    ], { encoding: 'utf8' });
    if (res.status !== 0) ffmpegOk = false;
  }
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await fs.rm(TEST_VIDEO, { force: true }).catch(() => {});
  if (createdProject) await fs.rm(path.join(projectsDir, createdProject), { recursive: true, force: true }).catch(() => {});
});

async function api(method, url, body, form) {
  const opts = { method, headers: {} };
  if (form) opts.body = form;
  else if (body) { opts.headers['content-type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch(base + url, opts);
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

function formOf(fields) {
  const form = new FormData();
  for (const [name, { filename, content, type }] of Object.entries(fields)) {
    form.append(name, new Blob([content], { type }), filename);
  }
  return form;
}

test('GET /api/health responde ok', async () => {
  const { status, data } = await api('GET', '/api/health');
  assert.equal(status, 200);
  assert.equal(data.status, 'ok');
  assert.equal(data.host, '127.0.0.1');
});

test('POST /api/import sem arquivos retorna 400', async () => {
  const { status, data } = await api('POST', '/api/import', undefined, new FormData());
  assert.equal(status, 400);
  assert.match(data.error, /não enviado/);
});

test('POST /api/import rejeita extensão de vídeo inválida', async () => {
  const form = formOf({ video: { filename: 'v.txt', type: 'text/plain', content: 'x' } });
  const { status, data } = await api('POST', '/api/import', undefined, form);
  assert.equal(status, 400);
  assert.ok(data.error);
});

test('POST /api/import cria projeto e inicia transcrição', async (t) => {
  if (!ffmpegOk || !ffprobeOk) { t.skip('FFmpeg/ffprobe indisponíveis'); return; }
  const projectName = 'API TESTE INTEGRAÇÃO ' + Date.now();
  createdProject = projectName;
  const form = formOf({ video: { filename: 'v.mp4', type: 'video/mp4', content: await fs.readFile(TEST_VIDEO) } });
  form.append('name', projectName);
  const { status, data } = await api('POST', '/api/import', undefined, form);
  assert.equal(status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.project.name, projectName);
  assert.equal(data.transcription.status, 'TRANSCRIBING');
  let statusRes;
  for (let attempt = 0; attempt < 40; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    statusRes = await api('GET', `/api/projects/${encodeURIComponent(projectName)}/transcription`);
    if (statusRes.data.transcription.status === 'ERROR') break;
  }
  assert.equal(statusRes.status, 200);
  assert.equal(statusRes.data.transcription.status, 'ERROR');
});

test('GET /api/projects/:name/transcription para projeto inexistente retorna 404', async () => {
  const { status, data } = await api('GET', '/api/projects/projeto_que_nao_existe_987/transcription');
  assert.equal(status, 404);
  assert.ok(data.error);
});

test('POST /api/projects/:name/cuts/:id/generate com id inválido retorna 400', async () => {
  const { status, data } = await api('POST', '/api/projects/qualquer/cuts/abc/generate');
  assert.equal(status, 400);
  assert.match(data.error, /inválido/);
});

test('POST /api/projects/:name/cuts/:id/preview com id inválido retorna 400', async () => {
  const { status, data } = await api('POST', '/api/projects/qualquer/cuts/xyz/preview');
  assert.equal(status, 400);
  assert.match(data.error, /inválido/);
});

test('POST /api/projects/:name/generate-all para projeto inexistente retorna 400', async () => {
  const { status, data } = await api('POST', '/api/projects/nao_existe_123/generate-all');
  assert.equal(status, 400);
  assert.ok(data.error);
});

test('POST /api/projects/:name/export sem cortes concluídos retorna 400', async () => {
  const { status, data } = await api('POST', '/api/projects/nao_existe_123/export');
  assert.equal(status, 400);
  assert.ok(data.error);
});

test('GET /api/projects retorna lista vazia ou array', async () => {
  const { status, data } = await api('GET', '/api/projects');
  assert.equal(status, 200);
  assert.ok(Array.isArray(data.projects));
});

test('POST /api/projects/:name/generate-all responde 202 para job assíncrono', async (t) => {
  if (!ffmpegOk) { t.skip('FFmpeg indisponível'); return; }

  const name = '__api_batch_' + Date.now();
  const dir = path.join(projectsDir, name);
  await fs.mkdir(path.join(dir, 'output'), { recursive: true });
  await fs.mkdir(path.join(dir, 'temp'), { recursive: true });
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify({
    project: name,
    sourceVideo: 'original.mp4',
    importedAt: new Date().toISOString(),
    cuts: [],
    validationErrors: [],
  }));

  try {
    const started = await api('POST', `/api/projects/${encodeURIComponent(name)}/generate-all`);
    assert.equal(started.status, 202);
    assert.equal(started.data.status, 'PROCESSING');

    const cancel = await api('DELETE', `/api/projects/${encodeURIComponent(name)}/generate-all`);
    assert.ok([202, 404].includes(cancel.status));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('GET /media bloqueia path traversal (400 pelo safeJoin)', async () => {
  const { status } = await api('GET', '/media/proj/..%2F..%2Fwindowss');
  assert.equal(status, 400);
});

test('GET /media normaliza traversal para fora da rota (404, sem vazar arquivo)', async () => {
  const { status } = await api('GET', '/media/..%2F..%2Fpackage.json');
  assert.equal(status, 404);
});

test('GET /media arquivo inexistente retorna 404', async () => {
  const { status, data } = await api('GET', '/media/proj_nao_existe/temp/arquivo.mp4');
  assert.equal(status, 404);
  assert.ok(data);
});
