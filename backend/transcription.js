import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { safeJoin } from './fs-utils.js';
import { transcribeVideo, checkWhisperAvailability, whisperConfig, srtBlockCount } from './transcribe.js';
import { setProgress, getProgress } from './progress.js';

const activeTranscriptions = new Map();

export function isTranscriptionRunning(name) {
  return activeTranscriptions.has(name);
}

export function cancelTranscription(name) {
  const controller = activeTranscriptions.get(name);
  if (!controller) return false;
  controller.abort();
  return true;
}

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
  const live = getProgress(name);
  return { ...base, srtSizeBytes, srtBlocks, progress: live };
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

async function runJob(name, videoPath, outputDir, signal) {
  const started = Date.now();
  let ref;
  try {
    ref = await readProjectState(name);
  } catch (err) {
    console.error(`[ERROR] Transcrição — projeto não encontrado: ${err.message}`);
    await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});
    return;
  }

  const totalDurationMs = Number(ref.manifest.videoDurationMs) || null;
  setProgress(name, {
    status: 'TRANSCRIBING',
    stage: 'WHISPER',
    progress: 0,
    elapsedSeconds: 0,
    estimatedRemainingSeconds: null,
    speed: null,
    currentTimeMs: 0,
    totalDurationMs,
    message: 'Preparando o Whisper…',
    startedAt: new Date().toISOString(),
  });

  try {
    const { srtPath } = await transcribeVideo({
      videoPath,
      outputDir,
      signal,
      onProgress: ({ progress, elapsedSeconds, speed, estimatedRemainingSeconds }) => {
        setProgress(name, {
          status: 'TRANSCRIBING',
          stage: 'WHISPER',
          progress,
          elapsedSeconds,
          estimatedRemainingSeconds,
          speed,
          currentTimeMs: totalDurationMs ? totalDurationMs * (progress / 100) : null,
          totalDurationMs,
          message: progress > 0 ? 'Transcrevendo áudio…' : 'Carregando modelo e preparando áudio…',
        });
      },
    });
    const projectSrtPath = path.join(ref.dir, 'original.srt');
    await fs.copyFile(srtPath, projectSrtPath);
    await applyTranscriptionReady(ref, { srtPath: projectSrtPath });
    const elapsedSeconds = (Date.now() - started) / 1000;
    setProgress(name, {
      status: 'SRT_READY',
      stage: 'READY',
      progress: 100,
      elapsedSeconds,
      estimatedRemainingSeconds: 0,
      currentTimeMs: totalDurationMs,
      totalDurationMs,
      message: 'Transcrição concluída. Escolha onde salvar o SRT.',
    });
    console.log(`[INFO] Transcrição concluída (${Math.round(elapsedSeconds)}s). SRT salvo em: ${projectSrtPath}`);
  } catch (err) {
    console.error(`[ERROR] Transcrição falhou: ${err.message}`);
    if (err.stderr) console.error(`[WHISPER-STDERR]\n${String(err.stderr).slice(0, 2000)}`);
    const freshRef = await readProjectState(name).catch(() => ref);
    if (freshRef) await applyTranscriptionError(freshRef, { message: err.message, stderr: err.stderr, exitCode: err.exitCode });
    setProgress(name, {
      status: 'ERROR',
      stage: 'WHISPER',
      message: err.message,
      elapsedSeconds: (Date.now() - started) / 1000,
    });
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function startTranscription(name) {
  if (activeTranscriptions.has(name)) {
    return { status: 'TRANSCRIBING', alreadyRunning: true };
  }

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
  const controller = new AbortController();
  activeTranscriptions.set(name, controller);
  await markTranscribing(ref);
  setProgress(name, {
    status: 'TRANSCRIBING',
    stage: 'WHISPER',
    progress: 0,
    elapsedSeconds: 0,
    estimatedRemainingSeconds: null,
    speed: null,
    currentTimeMs: 0,
    totalDurationMs: Number(ref.manifest.videoDurationMs) || null,
    message: 'Iniciando transcrição…',
    startedAt: new Date().toISOString(),
  });
  runJob(name, videoPath, outputDir, controller.signal)
    .catch(() => {})
    .finally(() => activeTranscriptions.delete(name));
  return { status: 'TRANSCRIBING', command: availability.program };
}
