import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { safeJoin } from './fs-utils.js';
import { getProject, saveManifest } from './projects.js';
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

export function deriveTranscriptionStatus(ref) {
  const m = ref.manifest;
  const stored = m.transcription && m.transcription.status;
  const sourceSrt = m.sourceSrt || (m.transcription && m.transcription.srtPath) || null;
  const srtPath = sourceSrt ? path.join(ref.dir, sourceSrt) : null;

  let status = stored || null;
  if (!status) {
    status = (sourceSrt && srtPath && existsSync(srtPath)) ? 'SRT_READY' : 'UPLOAD';
  } else if (status === 'SRT_READY' && (!srtPath || !existsSync(srtPath))) {
    status = 'ERROR';
  }

  return {
    ...(m.transcription || {}),
    status,
    sourceSrt,
    srtPath,
    srtExists: !!(srtPath && existsSync(srtPath)),
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
  } else if (ref.manifest.transcription && ref.manifest.transcription.srtBlocks) {
    srtBlocks = ref.manifest.transcription.srtBlocks;
  }
  return { ...base, srtSizeBytes, srtBlocks };
}

export async function applyTranscriptionReady(ref, { durationMs } = {}) {
  ref.manifest.sourceSrt = 'original.srt';
  ref.manifest.transcription = {
    ...(ref.manifest.transcription || {}),
    status: 'SRT_READY',
    srtPath: 'original.srt',
    srtBlocks: srtBlockCount(path.join(ref.dir, 'original.srt')),
    model: whisperConfig.model,
    language: whisperConfig.language,
    outputFormat: whisperConfig.outputFormat,
    durationMs: durationMs ?? ref.manifest.videoDurationMs ?? null,
    completedAt: new Date().toISOString(),
  };
  await persist(ref);
}

export async function applyTranscriptionError(ref, { message, stderr, exitCode } = {}) {
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
  ref.manifest.transcription = {
    ...(ref.manifest.transcription || {}),
    status: 'TRANSCRIBING',
    startedAt: new Date().toISOString(),
  };
  await persist(ref);
}

async function cleanupWhisperArtifacts(outputDir) {
  const exts = ['.srt', '.txt', '.json', '.tsv', '.vtt'];
  let files = [];
  try { files = await fs.readdir(outputDir); } catch { return; }
  for (const f of files) {
    if (exts.includes(path.extname(f).toLowerCase())) {
      await fs.rm(path.join(outputDir, f), { force: true }).catch(() => {});
    }
  }
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
    const projectSrtPath = path.join(ref.dir, 'original.srt');
    await fs.copyFile(srtPath, projectSrtPath);
    await applyTranscriptionReady(ref);
    console.log(`[INFO] Transcrição concluída (${Math.round((Date.now() - started) / 1000)}s). SRT: ${projectSrtPath}`);
    await cleanupWhisperArtifacts(outputDir);
  } catch (err) {
    console.error(`[ERROR] Transcrição falhou: ${err.message}`);
    if (err.stderr) console.error(`[WHISPER-STDERR]\n${String(err.stderr).slice(0, 2000)}`);
    const freshRef = await readProjectState(name).catch(() => ref);
    if (freshRef) {
      await applyTranscriptionError(freshRef, { message: err.message, stderr: err.stderr, exitCode: err.exitCode });
    }
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

  const outputDir = path.join(ref.dir, 'temp');
  await markTranscribing(ref);
  runJob(name, videoPath, outputDir).catch(() => {});
  return { status: 'TRANSCRIBING', command: availability.program };
}
