import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { validateRenderedMp4 } from '../backend/validate.js';

function validProbe({ width = 1080, height = 1920, codec = 'h264', duration = 2, withAudio = true } = {}) {
  const streams = [{ codec_type: 'video', codec_name: codec, width, height }];
  if (withAudio) streams.push({ codec_type: 'audio', codec_name: 'aac' });
  return { streams, format: { duration: String(duration) } };
}

async function tempFile(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rells-validate-'));
  const file = path.join(dir, 'out.mp4');
  fs.writeFileSync(file, content);
  return { dir, file, rm: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('validador rejeita caminho ausente', async () => {
  const result = await validateRenderedMp4('', { startMs: 0, endMs: 2000 });
  assert.equal(result.ok, false);
  assert.match(result.issues.join('|'), /ausente/);
});

test('validador rejeita arquivo inexistente', async () => {
  const result = await validateRenderedMp4(path.join(os.tmpdir(), 'nao_existe_xyz.mp4'));
  assert.equal(result.ok, false);
  assert.match(result.issues.join('|'), /não existe/);
});

test('validador rejeita arquivo vazio (0 bytes)', async () => {
  const t = await tempFile('');
  try {
    const result = await validateRenderedMp4(t.file);
    assert.equal(result.ok, false);
    assert.match(result.issues.join('|'), /0 bytes/);
  } finally {
    t.rm();
  }
});

test('validador mapeia falha do ffprobe como erro claro', async () => {
  const t = await tempFile(Buffer.from('lixo'));
  const probe = async () => {
    throw new Error('ffprobe não conseguiu ler o arquivo');
  };
  try {
    const result = await validateRenderedMp4(t.file, { startMs: 0, endMs: 2000, probe });
    assert.equal(result.ok, false);
    assert.match(result.issues.join('|'), /ffprobe/);
  } finally {
    t.rm();
  }
});

test('validador aceita MP4 válido (h264 1080x1920, áudio, duração confere)', async () => {
  const t = await tempFile(Buffer.from('mock'));
  const probe = async () => validProbe({ duration: 2 });
  try {
    const result = await validateRenderedMp4(t.file, { startMs: 0, endMs: 2000, probe });
    assert.equal(result.ok, true);
    assert.equal(result.issues.length, 0);
    assert.equal(result.durationSec, 2);
  } finally {
    t.rm();
  }
});

test('validador rejeita codec não-h264', async () => {
  const t = await tempFile(Buffer.from('mock'));
  const probe = async () => validProbe({ codec: 'vp9' });
  try {
    const result = await validateRenderedMp4(t.file, { probe });
    assert.equal(result.ok, false);
    assert.match(result.issues.join('|'), /vp9/);
  } finally {
    t.rm();
  }
});

test('validador rejeita resolução fora de 1080x1920', async () => {
  const t = await tempFile(Buffer.from('mock'));
  const probe = async () => validProbe({ width: 720, height: 1280 });
  try {
    const result = await validateRenderedMp4(t.file, { probe });
    assert.equal(result.ok, false);
    assert.match(result.issues.join('|'), /Largura inesperada/);
  } finally {
    t.rm();
  }
});

test('validador rejeita áudio ausente', async () => {
  const t = await tempFile(Buffer.from('mock'));
  const probe = async () => validProbe({ withAudio: false });
  try {
    const result = await validateRenderedMp4(t.file, { probe });
    assert.equal(result.ok, false);
    assert.match(result.issues.join('|'), /áudio/);
  } finally {
    t.rm();
  }
});

test('validador rejeita duração fora da janela do corte', async () => {
  const t = await tempFile(Buffer.from('mock'));
  const probe = async () => validProbe({ duration: 8 });
  try {
    const result = await validateRenderedMp4(t.file, { startMs: 0, endMs: 2000, probe });
    assert.equal(result.ok, false);
    assert.match(result.issues.join('|'), /Duração não confere/);
  } finally {
    t.rm();
  }
});

test('validador reporta múltiplas falhas de uma vez', async () => {
  const t = await tempFile(Buffer.from('mock'));
  const probe = async () => validProbe({ codec: 'mpeg4', width: 720, height: 1280, withAudio: false, duration: 9 });
  try {
    const result = await validateRenderedMp4(t.file, { startMs: 0, endMs: 2000, probe });
    assert.equal(result.ok, false);
    assert.ok(result.issues.length >= 4);
  } finally {
    t.rm();
  }
});