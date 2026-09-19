import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { safeJoin, sanitizeProjectName } from './fs-utils.js';
import { setProgress, getProgress } from './progress.js';
import { createProject, defaultProjectName } from './project.js';
import { startTranscription } from './transcription.js';

const execFileAsync = promisify(execFile);

const DOWNLOAD_TIMEOUT_MS = 2 * 60 * 60 * 1000;

const jobs = new Map();

export function getYtdlpBin() {
  const configured = (config.ytdlpPath || '').trim();
  return configured || 'yt-dlp';
}

export async function checkYtdlp() {
  const bin = getYtdlpBin();
  try {
    const { stdout } = await execFileAsync(bin, ['--version'], { timeout: 10000 });
    return {
      available: true,
      path: bin,
      version: String(stdout || '').trim().split('\n')[0] || '',
    };
  } catch (err) {
    return {
      available: false,
      path: bin,
      error: err.message || String(err),
    };
  }
}

export function isValidYoutubeUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return false;
  try {
    const u = new URL(url.trim());
    if (!/^https?:$/.test(u.protocol)) return false;
    const host = u.hostname.toLowerCase();
    return host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be' || host.endsWith('.youtu.be');
  } catch {
    return false;
  }
}

export function parseDownloadProgressLine(line = '', state = {}) {
  if (typeof line !== 'string' || !line.includes('[download]')) return state;
  const pct = line.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pct) state.percent = Math.max(0, Math.min(100, parseFloat(pct[1])));
  const speed = line.match(/at\s+([\d.]+)(?:[KMG]i?B\/s|B\/s)/);
  if (speed) state.speed = parseFloat(speed[1]);
  const eta = line.match(/ETA\s+(\d+(?::\d+)+)/);
  if (eta) {
    state.etaSeconds = eta[1]
      .split(':')
      .map(Number)
      .reduce((acc, n) => acc * 60 + n, 0);
  }
  return state;
}

async function findDownloadedFile(dir, base) {
  const entries = await fs.readdir(dir);
  const candidates = [];
  for (const file of entries.filter((f) => f.startsWith(`${base}.`))) {
    const ext = path.extname(file).toLowerCase();
    if (!['.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v'].includes(ext)) continue;
    const stat = await fs.stat(path.join(dir, file)).catch(() => null);
    if (stat) candidates.push({ file, mtimeMs: stat.mtimeMs });
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (!candidates.length) throw new Error('Arquivo de vídeo baixado não encontrado após o download.');
  return path.join(dir, candidates[0].file);
}

async function assertHasAudioStream(filePath) {
  const ffprobeBin = config.ffprobePath || 'ffprobe';
  const { stdout } = await execFileAsync(ffprobeBin, [
    '-v', 'error',
    '-select_streams', 'a:0',
    '-show_entries', 'stream=codec_type',
    '-of', 'csv=p=0',
    filePath,
  ], { timeout: 30000 });
  if (!String(stdout).trim()) {
    throw new Error('O vídeo baixado não possui faixa de áudio. O YouTube não forneceu áudio compatível para este link.');
  }
}

export function downloadVideo({ url, outputDir, filename = 'video', onProgress, timeoutMs = DOWNLOAD_TIMEOUT_MS }) {
  const bin = getYtdlpBin();
  const args = [
    '--no-playlist',
    '--newline',
    '--no-warnings',
    '--no-part',
    '-f', 'bestvideo*+bestaudio/best',
    '--merge-output-format', 'mp4',
    '--remux-video', 'mp4',
    '-o', path.join(outputDir, `${filename}.%(ext)s`),
    url,
  ];
  if (config.denoPath) args.unshift('--js-runtimes', `deno:${config.denoPath}`);

  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let lastError = '';
    const state = { percent: 0, speed: null, etaSeconds: null };

    const report = () => {
      if (typeof onProgress === 'function') onProgress({ ...state });
    };

    const handleChunk = (chunk) => {
      const text = chunk.toString();
      stderr += text;
      const lines = text.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('ERROR:')) lastError = trimmed.slice('ERROR:'.length).trim();
        if (/^\[download\]/.test(trimmed)) {
          parseDownloadProgressLine(trimmed, state);
          report();
        }
      }
    };

    child.stdout.on('data', handleChunk);
    child.stderr.on('data', handleChunk);

    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Tempo de download excedido (${Math.round(timeoutMs / 60000)} min).`));
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Não foi possível executar o yt-dlp (${bin}): ${err.message}`));
    });

    child.on('close', async (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        const msg = lastError || `yt-dlp encerrou com código ${code}.`;
        reject(new Error(msg));
        return;
      }
      try {
        const filePath = await findDownloadedFile(outputDir, filename);
        await assertHasAudioStream(filePath);
        resolve(filePath);
      } catch (err) {
        reject(new Error(`Download concluído mas o arquivo de vídeo não foi encontrado: ${err.message}`));
      }
    });
  });
}

async function createDownloadTempDir() {
  const root = path.join(os.tmpdir(), 'rells-engine-youtube');
  await fs.mkdir(root, { recursive: true });
  return fs.mkdtemp(path.join(root, `dl-${crypto.randomUUID()}-`));
}

async function runJob(name, url) {
  const startedAt = Date.now();
  const downloadDir = await createDownloadTempDir();
  try {
    const videoPath = await downloadVideo({
      url,
      outputDir: downloadDir,
      onProgress: ({ percent, speed, etaSeconds }) => {
        setProgress(name, {
          status: 'DOWNLOADING',
          stage: 'YTDLP',
          progress: percent,
          speed,
          estimatedRemainingSeconds: etaSeconds,
          elapsedSeconds: (Date.now() - startedAt) / 1000,
          currentTimeMs: null,
          totalDurationMs: null,
          message: 'Baixando vídeo do YouTube…',
          startedAt: new Date(startedAt).toISOString(),
        });
      },
    });

    const project = await createProject({
      name,
      videoFile: { path: videoPath, originalname: path.basename(videoPath) },
      srtFile: null,
      cortesFile: null,
    });

    console.log('[INFO] Projeto importado do YouTube:', project.name);
    console.log(`[INFO] Duracao: ${project.videoDurationMs} ms`);

    const transcription = await startTranscription(project.name);
    console.log(`[INFO] Transcricao: ${transcription.status}`);
    return { ok: true, projectName: name, transcription };
  } catch (err) {
    console.error('[ERROR] Importação via YouTube:', err.message);
    setProgress(name, {
      status: 'ERROR',
      stage: 'YTDLP',
      progress: 0,
      message: err.message,
      elapsedSeconds: (Date.now() - startedAt) / 1000,
    });
    return { ok: false, projectName: name, error: err.message };
  } finally {
    await fs.rm(downloadDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function startDownloadImport({ url, name }) {
  if (!isValidYoutubeUrl(url)) {
    throw new Error('Link inválido. Informe uma URL do YouTube (youtube.com ou youtu.be).');
  }

  const availability = await checkYtdlp();
  if (!availability.available) {
    throw new Error(
      availability.error
        ? `yt-dlp indisponível: ${availability.error}. Instale o yt-dlp ou configure YTDLP_PATH no .env.`
        : 'yt-dlp não encontrado. Instale o yt-dlp ou configure YTDLP_PATH no .env.',
    );
  }

  const safeName = sanitizeProjectName(name || defaultProjectName(), { fallback: '' }) || defaultProjectName();
  const projectDir = safeJoin(config.dirs.projects, safeName);
  if (existsSync(projectDir)) {
    throw new Error(`Projeto "${safeName}" já existe. Exclua a pasta ou use outro nome.`);
  }

  if (!jobs.has(safeName)) {
    setProgress(safeName, {
      status: 'DOWNLOADING',
      stage: 'YTDLP',
      progress: 0,
      message: 'Iniciando download…',
      startedAt: new Date().toISOString(),
    });
    const job = runJob(safeName, url).finally(() => jobs.delete(safeName));
    job.catch(() => {});
    jobs.set(safeName, job);
  }

  return { projectName: safeName, status: 'DOWNLOADING' };
}

export function getDownloadStatus(name) {
  return getProgress(name);
}

export function isDownloadRunning(name) {
  return jobs.has(name);
}