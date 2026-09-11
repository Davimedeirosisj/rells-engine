import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createApp } from '../backend/server.js';
import { config } from '../backend/config.js';
import { spawnSync } from 'node:child_process';
import { checkFfmpeg, checkFfprobe } from '../backend/system.js';

const projectsDir = config.dirs.projects;
const TEST_VIDEO = path.join(config.dirs.temp ?? 'temp', 'api-test-video.mp4');

let server;
let base = '';
let ffmpegOk = false;
let ffprobeOk = false;

before(async () => {
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;

  const [ff, fp] = await Promise.all([checkFfmpeg(), checkFfprobe()]);
  ffmpegOk = ff.available;
  ffprobeOk = fp.available;

  if (ffmpegOk && ffprobeOk) {
    const res = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=25:duration=2',
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-shortest',
        TEST_VIDEO,
      ],
      { encoding: 'utf8' },
    );
    if (res.status !== 0) {
      ffmpegOk = false;
    }
  }
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await fs.rm(TEST_VIDEO, { force: true }).catch(() => {});
});

async function api(method, url, body, form) {
  const opts = { method, headers: {} };
  if (form) opts.body = form;
  else if (body) {
    opts.headers['content-type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
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
});

test('POST /api/import sem arquivos retorna 400', async () => {
  const { status, data } = await api('POST', '/api/import', undefined, new FormData());
  assert.equal(status, 400);
  assert.match(data.error, /não enviado/);
});

test('POST /api/import com cortes.json inválido retorna 400', async () => {
  const form = formOf({
    video: { filename: 'v.mp4', type: 'video/mp4', content: 'x' },
    srt: { filename: 'l.srt', type: 'application/x-subrip', content: '1\n00:00:00,000 --> 00:00:01,000\nhi' },
    cortes: { filename: 'c.json', type: 'application/json', content: 'nao é json' },
  });
  const { status, data } = await api('POST', '/api/import', undefined, form);
  assert.equal(status, 400);
  assert.ok(data.error);
});

test('POST /api/import fluxo feliz importa projeto e valida cortes', async (t) => {
  if (!ffmpegOk || !ffprobeOk) {
    t.skip('FFmpeg/ffprobe indisponíveis');
    return;
  }
  const projectName = 'API TESTE INTEGRAÇÃO ' + Date.now();
  const video = await fs.readFile(TEST_VIDEO);
  const srt = '1\n00:00:00,000 --> 00:00:01,500\nFala um.\n';
  const cortes = JSON.stringify({
    project: { name: projectName },
    preset: 'teste',
    cuts: [
      { id: 1, start: '00:00:00,000', end: '00:00:01,500', cover_hook: 'H', title: 'T1', theme: 'Tema 1', speech: 's' },
    ],
  });

  const form = formOf({
    video: { filename: 'v.mp4', type: 'video/mp4', content: video },
    srt: { filename: 'l.srt', type: 'application/x-subrip', content: srt },
    cortes: { filename: 'c.json', type: 'application/json', content: cortes },
  });

  const { status, data } = await api('POST', '/api/import', undefined, form);
  assert.equal(status, 201);
  assert.equal(data.ok, true);
  assert.equal(data.cuts.valid, 1);
  assert.equal(data.cuts.errors.length, 0);

  await fs.rm(path.join(projectsDir, projectName), { recursive: true, force: true });
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