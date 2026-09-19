/**
 * RELLS ENGINE — Testes do endpoint real GET /api/projects/:name/srt.
 *
 * CRITÉRIOS:
 * 1. projeto existente + transcription.srtPath existente → 200
 * 2. conteúdo retornado é EXATAMENTE igual ao arquivo SRT
 * 3. Content-Type: application/x-subrip; charset=utf-8
 * 4. Content-Disposition: attachment; filename="original.srt"
 * 5. projeto inexistente → 404
 * 6. SRT da transcrição ausente → 404
 * 7. path traversal é rejeitada
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../backend/server.js';
import { config } from '../backend/config.js';

const projectsDir = config.dirs.projects;

let server;
let base = '';
const createdProjects = [];

function uniqueName() {
  return '__srt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

// Cria um projeto com uma transcrição SRT pronta (srtPath absoluto).
async function makeProject({ srtContent } = {}) {
  const name = uniqueName();
  const dir = path.join(projectsDir, name);
  createdProjects.push(name);
  await fs.mkdir(path.join(dir, 'output'), { recursive: true });
  await fs.mkdir(path.join(dir, 'temp'), { recursive: true });

  const srtPath = path.join(dir, 'temp', 'transcricao.srt');
  await fs.writeFile(srtPath, srtContent ?? '1\n00:00:01,000 --> 00:00:05,000\nOlá mundo.\n');

  await fs.writeFile(
    path.join(dir, 'manifest.json'),
    JSON.stringify({
      project: name,
      sourceVideo: 'original.mp4',
      importedAt: new Date().toISOString(),
      videoDurationMs: 120000,
      cuts: [],
      validationErrors: [],
      transcription: { status: 'SRT_READY', srtPath },
    }, null, 2),
  );

  return { name };
}

before(async () => {
  const app = createApp();
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await Promise.all(
    createdProjects.map((name) => fs.rm(path.join(projectsDir, name), { recursive: true, force: true })),
  );
});

describe('GET /api/projects/:name/srt', () => {
  it('retorna 200 com o conteúdo EXATO do SRT e headers corretos', async () => {
    const srtContent = '1\n00:00:01,000 --> 00:00:05,000\nOlá, bem-vindo ao vídeo.\n\n2\n00:00:05,000 --> 00:00:10,000\nLegenda gerada pelo Whisper.';
    const { name } = await makeProject({ srtContent });

    const res = await fetch(`${base}/api/projects/${encodeURIComponent(name)}/srt`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('application/x-subrip'));
    assert.ok(res.headers.get('content-type').includes('charset=utf-8'));
    assert.ok(res.headers.get('content-disposition').includes('attachment; filename="original.srt"'));
    assert.equal(await res.text(), srtContent);
  });

  it('preserva bytes, acentos e quebras de linha exatamente', async () => {
    const exact = `1\n00:00:01,500 --> 00:00:02,000\nPrimeira legenda com espaço.  \n\n2\n00:00:05,000 --> 00:00:10,000\nAcentos: áéíóú âêîôû ãõñ ç ü.`;
    const { name } = await makeProject({ srtContent: exact });

    const res = await fetch(`${base}/api/projects/${encodeURIComponent(name)}/srt`);
    assert.equal(res.status, 200);
    const received = Buffer.from(await res.arrayBuffer());
    assert.equal(received.toString('hex'), Buffer.from(exact, 'utf8').toString('hex'));
  });

  it('retorna 404 para projeto inexistente', async () => {
    const res = await fetch(`${base}/api/projects/projeto_que_nao_existe_999/srt`);
    assert.equal(res.status, 404);
    const data = await res.json();
    assert.equal(data.ok, false);
    assert.ok(data.error && data.error.includes('não encontrado'));
  });

  it('retorna 404 quando o SRT da transcrição não está disponível', async () => {
    const name = uniqueName();
    const dir = path.join(projectsDir, name);
    createdProjects.push(name);
    await fs.mkdir(path.join(dir, 'output'), { recursive: true });
    await fs.mkdir(path.join(dir, 'temp'), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'manifest.json'),
      JSON.stringify({
        project: name,
        sourceVideo: 'original.mp4',
        transcription: { status: 'ERROR' },
      }),
    );

    const res = await fetch(`${base}/api/projects/${encodeURIComponent(name)}/srt`);
    assert.equal(res.status, 404);
    const data = await res.json();
    assert.equal(data.ok, false);
  });

  it('bloqueia path traversal no nome do projeto', async () => {
    const res = await fetch(`${base}/api/projects/${encodeURIComponent('..%2F..%2Fpackage.json')}/srt`);
    assert.equal(res.status, 404);
    const data = await res.json();
    assert.equal(data.ok, false);
    assert.ok(data.error && data.error.length > 0);
    assert.ok(!data.error.includes('"name"'));
  });

  it('suporta nomes de projeto longos', async () => {
    const srtContent = '1\n00:00:00,000 --> 00:00:05,000\nTeste.';
    const name = 'projeto-' + 'a'.repeat(120);
    const dir = path.join(projectsDir, name);
    createdProjects.push(name);
    await fs.mkdir(path.join(dir, 'output'), { recursive: true });
    await fs.mkdir(path.join(dir, 'temp'), { recursive: true });
    const srtPath = path.join(dir, 'temp', 't.srt');
    await fs.writeFile(srtPath, srtContent);
    await fs.writeFile(
      path.join(dir, 'manifest.json'),
      JSON.stringify({ project: name, sourceVideo: 'original.mp4', transcription: { status: 'SRT_READY', srtPath } }),
    );

    const res = await fetch(`${base}/api/projects/${encodeURIComponent(name)}/srt`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), srtContent);
  });
});