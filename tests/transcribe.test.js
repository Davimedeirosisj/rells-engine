import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import {
  buildWhisperArgs,
  expectedSrtPath,
  whisperOutputName,
  checkWhisperAvailability,
  transcribeVideo,
  srtBlockCount,
  whisperConfig,
} from '../backend/transcribe.js';
import {
  deriveTranscriptionStatus,
  applyTranscriptionReady,
  applyTranscriptionError,
  getTranscriptionStatus,
} from '../backend/transcription.js';

let tmp;

function makeFakeSpawn(resultFn) {
  return (program, args, opts) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    const r = typeof resultFn === 'function' ? resultFn(program, args, opts) : resultFn;
    if (r === 'ENOENT') {
      setImmediate(() => child.emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' })));
    } else {
      setImmediate(() => {
        if (r.stdout) child.stdout.emit('data', Buffer.from(r.stdout));
        if (r.stderr) child.stderr.emit('data', Buffer.from(r.stderr));
        child.emit('close', r.exitCode ?? 0, null);
      });
    }
    return child;
  };
}

function fakeSuccessSpawn() {
  return makeFakeSpawn(() => ({ exitCode: 0, stdout: 'Transcrevendo...', stderr: '' }));
}

function fakeErrorSpawn() {
  return makeFakeSpawn(() => ({ exitCode: 1, stdout: '', stderr: 'Erro de execução do ffmpeg' }));
}

function fakeEnoentSpawn() {
  return makeFakeSpawn(() => 'ENOENT');
}

function fakeHelpOnlySpawn() {
  return makeFakeSpawn((program, args) => {
    if (args.includes('--help')) return { exitCode: 0, stdout: 'usage: whisper', stderr: '' };
    return { exitCode: 0, stdout: 'ok', stderr: '' };
  });
}

function fakeTranscribeSuccessSpawn() {
  return makeFakeSpawn((program, args) => {
    if (args.includes('--help')) return { exitCode: 0, stdout: 'usage: whisper', stderr: '' };
    return { exitCode: 0, stdout: 'Transcrevendo audio em texto...', stderr: '' };
  });
}

function makeRef(tmpDir, manifest = {}) {
  const dir = path.join(tmpDir, 'projeto-teste');
  return { name: 'projeto-teste', dir, manifestPath: path.join(dir, 'manifest.json'), manifest };
}

// --- 1. Comando construído corretamente ---
test('buildWhisperArgs: modelo, idioma, formato e outputPath', () => {
  const args = buildWhisperArgs('video.mp4', '/out', { model: 'turbo', language: 'pt', outputFormat: 'srt' });
  assert.equal(args[0], 'video.mp4');
  const mi = args.indexOf('--model');
  assert.equal(args[mi + 1], 'turbo');
  const li = args.indexOf('--language');
  assert.equal(args[li + 1], 'pt');
  const fi = args.indexOf('--output_format');
  assert.equal(args[fi + 1], 'srt');
  const oi = args.indexOf('--output_dir');
  assert.equal(args[oi + 1], '/out');
});

// --- 2. Modelo turbo ---
test('buildWhisperArgs: modelo padrão é turbo', () => {
  const args = buildWhisperArgs('x.mp4', '/out');
  const mi = args.indexOf('--model');
  assert.equal(args[mi + 1], whisperConfig.model);
  assert.equal(whisperConfig.model, 'turbo');
});

// --- 3. Caminho com espaços ---
test('buildWhisperArgs: caminho com espaços não é quebrado', () => {
  const videoPath = 'C:\\Ministério\\CULTO - 08 setembro 2026 - 08-02-13 .mp4';
  const args = buildWhisperArgs(videoPath, 'D:\\out');
  assert.equal(args[0], videoPath);
  assert.ok(args.includes(videoPath));
  // Não deve conter partes fragmentadas do caminho
  assert.ok(!args.some((a) => a === 'CULTO'));
});

// --- 4. Caminho com acentos ---
test('buildWhisperArgs: caminho com acentos é preservado integralmente', () => {
  const videoPath = 'C:\\Pastor\\CULTO São João - Edição Êxodo.mp4';
  const args = buildWhisperArgs(videoPath, 'D:\\out');
  assert.equal(args[0], videoPath);
});

// --- 5. expectedSrtPath (stem do arquivo) ---
test('expectedSrtPath: gera nome .srt a partir do stem do vídeo', () => {
  assert.equal(expectedSrtPath('video.mp4', '/out'), path.join('/out', 'video.srt'));
  assert.equal(
    expectedSrtPath('C:\\Pastor\\CULTO São João - Edição Êxodo.mp4', '/out'),
    path.join('/out', 'CULTO São João - Edição Êxodo.srt'),
  );
});

// --- 6. whisperOutputName ---
test('whisperOutputName: extrai stem + .srt', () => {
  assert.equal(whisperOutputName('video.mp4'), 'video.srt');
  assert.equal(whisperOutputName('CULTO - 08 setembro 2026 - 08-02-13 .mp4'), 'CULTO - 08 setembro 2026 - 08-02-13 .srt');
});

// --- 7. Processo bem-sucedido ---
test('transcribeVideo: processo bem-sucedido (exit 0, SRT existe)', async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rells-test-'));
  const outputDir = path.join(tmp, 'whisper-output');
  await fs.mkdir(outputDir, { recursive: true });
  const fakeVideo = path.join(tmp, 'video.mp4');
  await fs.writeFile(fakeVideo, 'fake-video');
  const expectedSrt = path.join(outputDir, 'video.srt');
  await fs.writeFile(expectedSrt, '1\n00:00:00,000 --> 00:00:05,000\nOlá mundo\n\n');

  const spawnFn = fakeTranscribeSuccessSpawn();
  const result = await transcribeVideo({ videoPath: fakeVideo, outputDir, spawnFn });
  assert.ok(result.srtPath.endsWith('.srt'));
  assert.ok(existsSync(result.srtPath));
  assert.ok(result.stdout.includes('Transcrevendo'));
});

// --- 8. Processo com erro ---
test('transcribeVideo: processo com código de saída diferente de 0', async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rells-test-'));
  const outputDir = path.join(tmp, 'whisper-output');
  await fs.mkdir(outputDir, { recursive: true });
  const fakeVideo = path.join(tmp, 'video.mp4');
  await fs.writeFile(fakeVideo, 'fake-video');

  await assert.rejects(
    () => transcribeVideo({ videoPath: fakeVideo, outputDir, spawnFn: fakeErrorSpawn() }),
    (err) => {
      assert.ok(err.message.includes('código de saída 1'));
      assert.equal(err.exitCode, 1);
      assert.equal(err.stderr, 'Erro de execução do ffmpeg');
      return true;
    },
  );
});

// --- 9. Whisper inexistente (ENOENT) ---
test('checkWhisperAvailability: retorna available:false quando Whisper não existe', async () => {
  const result = await checkWhisperAvailability({ spawnFn: fakeEnoentSpawn(), timeoutMs: 5000 });
  assert.equal(result.available, false);
  assert.ok(result.error.includes('não encontrado'));
});

// --- 10. SRT não criado ---
test('transcribeVideo: exit 0 mas SRT não existe no disco', async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rells-test-'));
  const outputDir = path.join(tmp, 'whisper-output');
  await fs.mkdir(outputDir, { recursive: true });
  const fakeVideo = path.join(tmp, 'video.mp4');
  await fs.writeFile(fakeVideo, 'fake-video');

  const spawnFn = fakeHelpOnlySpawn();
  await assert.rejects(
    () => transcribeVideo({ videoPath: fakeVideo, outputDir, spawnFn }),
    (err) => {
      assert.ok(err.message.includes('SRT') || err.code === 'WHISPER_SRT_MISSING');
      return true;
    },
  );
});

// --- 11. manifest atualizado após sucesso ---
test('deriveTranscriptionStatus + applyTranscriptionReady: SRT_READY', async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rells-test-'));
  const ref = makeRef(tmp, {});
  await fs.mkdir(ref.dir, { recursive: true });
  await fs.writeFile(ref.manifestPath, JSON.stringify(ref.manifest, null, 2), 'utf8');

  // Estado inicial: UPLOAD
  const fresh = deriveTranscriptionStatus(ref);
  assert.equal(fresh.status, 'UPLOAD');

  // Marcar como pronto
  const srtPath = path.join(ref.dir, 'original.srt');
  await fs.writeFile(srtPath, '1\n00:00:00,000 --> 00:00:10,000\nOlá mundo\n\n');
  await applyTranscriptionReady(ref);

  const after = deriveTranscriptionStatus(ref);
  assert.equal(after.status, 'SRT_READY');
  assert.equal(after.sourceSrt, 'original.srt');
  assert.equal(after.srtExists, true);
  assert.equal(srtBlockCount(path.join(ref.dir, 'original.srt')), 1);
});

// --- 12. manifest não marcado pronto após falha ---
test('deriveTranscriptionStatus + applyTranscriptionError: ERROR', async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rells-test-'));
  const ref = makeRef(tmp, {});
  await fs.mkdir(ref.dir, { recursive: true });
  await fs.writeFile(ref.manifestPath, JSON.stringify(ref.manifest, null, 2), 'utf8');

  await applyTranscriptionError(ref, { message: 'Whisper não encontrado', exitCode: 1, stderr: 'traceback...' });

  const status = deriveTranscriptionStatus(ref);
  assert.equal(status.status, 'ERROR');
  assert.equal(status.sourceSrt, null);
  assert.equal(status.error, 'Whisper não encontrado');
  assert.equal(status.exitCode, 1);
  assert.ok(status.stderr.includes('traceback'));
});

// --- srtBlockCount ---
test('srtBlockCount: conta blocos numéricos no SRT', async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rells-test-'));
  const srtPath = path.join(tmp, 'test.srt');
  await fs.writeFile(srtPath, '1\n00:00:00,000 --> 00:00:05,000\nPrimeiro\n\n2\n00:00:05,000 --> 00:00:10,000\nSegundo\n\n3\n00:00:10,000 --> 00:00:15,000\nTerceiro\n\n');
  assert.equal(srtBlockCount(srtPath), 3);
  assert.equal(srtBlockCount('/nao/existe.srt'), 0);
});

// --- timeout ---
test('transcribeVideo: timeout rejeita com WHISPER_TIMEOUT', async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rells-test-'));
  const outputDir = path.join(tmp, 'whisper-output');
  await fs.mkdir(outputDir, { recursive: true });
  const fakeVideo = path.join(tmp, 'video.mp4');
  await fs.writeFile(fakeVideo, 'fake-video');

  const hangOnTranscribeSpawn = (program, args) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    if (args.includes('--help')) {
      setImmediate(() => {
        child.stdout.emit('data', Buffer.from('usage: whisper'));
        child.emit('close', 0, null);
      });
    }
    // Para transcrição: nunca emite close → timeout dispara
    return child;
  };

  await assert.rejects(
    () => transcribeVideo({ videoPath: fakeVideo, outputDir, spawnFn: hangOnTranscribeSpawn, cfg: { ...whisperConfig, timeoutMs: 50 } }),
    (err) => {
      assert.ok(err.message.includes('tempo limite'), `Mensagem: ${err.message}`);
      assert.equal(err.code, 'WHISPER_TIMEOUT');
      return true;
    },
  );
});

// Cleanup
test.afterEach(() => {
  if (tmp && existsSync(tmp)) {
    fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
    tmp = null;
  }
});
