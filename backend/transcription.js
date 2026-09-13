import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { safeJoin } from './fs-utils.js';
import { transcribeVideo, checkWhisperAvailability, whisperConfig, srtBlockCount } from './transcribe.js';

async function readProjectState(name) {
  const dir = safeJoin(config.dirs.projects, name);
  const manifestPath = path.join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) throw new Error(`Projeto "${name}" não encontrado.`);
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  return { name, dir, manifest, manifestPath };
}

async function persist(ref) {
  await fs.writeFile(ref.manifestPath, JSON.stringify(ref.manifest, null, 2), 'utf8');
}

function getStoredSrtPath(ref) {
  return ref.manifest.transcription?.srtPath || null;
}

export function deriveTranscriptionStatus(ref) {
  const m = ref.manifest;
  const stored = m.transcription && m.transcription.status;
  const srtPath = getStoredSrtPath(ref);
  const srtExists = !!(srtPath && existsSync(srtPath));

  let status = stored || null;
  if (!status) status = srtExists ? 'SRT_READY' : 'UPLOAD';
  else if (status === 'SRT_READY' && !srtExists) status = 'ERROR';

  return {
    ...(m.transcription || {}),
    status,
    sourceSrt: null,
    srtPath,
    srtExists,
  };
}

export async function getTranscriptionStatus(name) {
  const ref = await readProjectState(name);
  const base = deriveTranscriptionStatus(ref);
  const srt = base.srtPath;
  let srtSizeBytes = null;
  let srtBlocks = null;
  if (srt && existsSync(srt)) {
    const stat = await fs.stat(srt);
    srtSizeBytes = stat.size;
    srtBlocks = srtBlockCount(srt);
  } else if (ref.manifest.transcription?.srtBlocks) {
    srtBlocks = ref.manifest.transcription.srtBlocks;
  }
  return { ...base, srtSizeBytes, srtBlocks };
}

export async function applyTranscriptionReady(ref, { srtPath, durationMs } = {}) {
  if (!srtPath || !existsSync(srtPath)) {
    throw new Error(`SRT da transcrição não encontrado: ${srtPath || '(caminho ausente)'}`);
  }

  ref.manifest.sourceSrt = null;
  ref.manifest.transcription = {
    ...(ref.manifest.transcription || {}),
    status: 'SRT_READY',
    srtPath: path.resolve(srtPath),
    srtBlocks: srtBlockCount(srtPath),
    model: whisperConfig.model,
    language: whisperConfig.language,
    outputFormat: whisperConfig.outputFormat,
    durationMs: durationMs ?? ref.manifest.videoDurationMs ?? null,
    completedAt: new Date().toISOString(),
  };
  await persist(ref);
}

export async function applyTranscriptionError(ref, { message, stderr, exitCode } = {}) {
  ref.manifest.sourceSrt = null;
  ref.manifest.transcription = {
    ...(ref.manifest.transcription || {}),
    status: 'ERROR',
    error: message || 'Falha desconhecida na transcrição.',
    ...(stderr ? { stderr: String(stderr).slice(0, 4000) } : {}),
    ...(exitCode !== undefined ? { exitCode } : {}),
    failedAt: new Date().toISOString(),
  };
  await persist(ref);
}

export async function markTranscribing(ref) {
  ref.manifest.sourceSrt = null;
  ref.manifest.transcription = {
    ...(ref.manifest.transcription || {}),
    status: 'TRANSCRIBING',
    srtPath: null,
    startedAt: new Date().toISOString(),
  };
  await persist(ref);
}

async function createTranscriptionTempDir() {
  const root = path.join(os.tmpdir(), 'rells-engine-transcriptions');
  await fs.mkdir(root, { recursive: true });
  return fs.mkdtemp(path.join(root, `srt-${crypto.randomUUID()}-`));
}

async function runJob(name, videoPath, outputDir) {
  const started = Date.now();
  let ref;
  try {
    ref = await readProjectState(name);
  } catch (err) {
    console.error(`[ERROR] Transcrição — projeto não encontrado: ${err.message}`);
    return;
  }

  try {
    const { srtPath } = await transcribeVideo({ videoPath, outputDir });
    await applyTranscriptionReady(ref, { srtPath });
    console.log(`[INFO] Transcrição concluída (${Math.round((Date.now() - started) / 1000)}s). SRT temporário: ${srtPath}`);
  } catch (err) {
    console.error(`[ERROR] Transcrição falhou: ${err.message}`);
    if (err.stderr) console.error(`[WHISPER-STDERR]\n${String(err.stderr).slice(0, 2000)}`);
    const freshRef = await readProjectState(name).catch(() => ref);
    if (freshRef) await applyTranscriptionError(freshRef, { message: err.message, stderr: err.stderr, exitCode: err.exitCode });
  }
}

export async function startTranscription(name) {
  const ref = await readProjectState(name);
  const videoPath = path.join(ref.dir, ref.manifest.sourceVideo);
  if (!existsSync(videoPath)) {
    await applyTranscriptionError(ref, { message: `Vídeo original não encontrado: ${videoPath}` });
    return { status: 'ERROR', error: `Vídeo original não encontrado: ${videoPath}` };
  }

  const availability = await checkWhisperAvailability();
  if (!availability.available) {
    await applyTranscriptionError(ref, { message: availability.error });
    return { status: 'ERROR', error: availability.error };
  }

  const outputDir = await createTranscriptionTempDir();
  await markTranscribing(ref);
  runJob(name, videoPath, outputDir).catch(() => {});
  return { status: 'TRANSCRIBING', command: availability.program };
}
