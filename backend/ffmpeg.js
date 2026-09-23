import { spawn } from 'node:child_process';
import { getFfmpegBin } from './system.js';
import { buildVideoFilter } from './filter.js';
import { assertFontAvailable } from './fonts.js';

const MAX_CAPTURE_BYTES = 64 * 1024;

function appendTail(current, chunk, maxBytes = MAX_CAPTURE_BYTES) {
  const next = current + chunk;
  return next.length > maxBytes ? next.slice(-maxBytes) : next;
}

export function msToFfmpegTime(ms) {
  const total = Math.round(ms);
  if (total < 0) throw new Error('Timestamp negativo não permitido.');
  const h = Math.floor(total / 3600000);
  const m = Math.floor((total % 3600000) / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const msPart = total % 1000;
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(msPart, 3)}`;
}

export function buildCutCommand(inputPath, startMs, endMs, { theme = '', handle, avatarPath, handleImagePath, verificationPath, titleMode = 'overlay', showArroba = true } = {}) {
  const start = msToFfmpegTime(startMs);
  const end = msToFfmpegTime(endMs);
  const fontPath = assertFontAvailable();
  const { filter, extraInputs } = buildVideoFilter({ theme, fontPath, handle, avatarPath, handleImagePath, verificationPath, titleMode, showArroba });
  const args = ['-y', '-ss', start, '-to', end, '-i', inputPath];
  for (const extra of extraInputs) args.push('-i', extra);
  args.push('-filter_complex', filter, '-map', '[v]', '-map', '0:a:0', '-r', '30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart');
  return args;
}

export function buildPreviewCommand(inputPath, startMs, endMs, { theme = '', handle, avatarPath, handleImagePath, verificationPath, titleMode = 'overlay', showArroba = true, durationMs } = {}) {
  const start = msToFfmpegTime(startMs);
  const previewDuration = durationMs || Math.min(endMs - startMs, 3000);
  const fontPath = assertFontAvailable();
  const { filter, extraInputs } = buildVideoFilter({ theme, fontPath, handle, avatarPath, handleImagePath, verificationPath, titleMode, showArroba });
  const args = ['-y', '-ss', start, '-t', msToFfmpegTime(previewDuration), '-i', inputPath];
  for (const extra of extraInputs) args.push('-i', extra);
  args.push('-filter_complex', filter, '-map', '[v]', '-map', '0:a:0', '-r', '30', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '32', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart');
  return args;
}

export function runFfmpeg(args, { onProgress, totalDurationMs, signal } = {}) {
  const bin = getFfmpegBin();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const error = new Error('Processamento cancelado.');
      error.code = 'ABORT_ERR';
      reject(error);
      return;
    }
    const childArgs = [...args];
    if (typeof onProgress === 'function') {
      childArgs.splice(Math.max(0, childArgs.length - 1), 0, '-progress', 'pipe:1', '-nostats');
    }

    const child = spawn(bin, childArgs, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let settled = false;
    let stderr = '';
    let stdout = '';
    let lastOutTimeMs = 0;
    const startedAt = Date.now();

    const report = (rawOutTimeMs) => {
      if (typeof onProgress !== 'function' || !Number.isFinite(rawOutTimeMs)) return;
      const outTimeMs = rawOutTimeMs / 1000;
      lastOutTimeMs = Math.max(lastOutTimeMs, outTimeMs);
      const elapsedSeconds = (Date.now() - startedAt) / 1000;
      const percent = totalDurationMs ? Math.max(0, Math.min(99.9, (lastOutTimeMs / totalDurationMs) * 100)) : 0;
      const speed = percent > 0 ? percent / Math.max(elapsedSeconds, 0.1) : null;
      const estimatedRemainingSeconds = speed ? Math.max(0, (100 - percent) / speed) : null;
      onProgress({ progress: percent, elapsedSeconds, estimatedRemainingSeconds, speed, currentTimeMs: lastOutTimeMs, totalDurationMs });
    };

    let progressBuffer = '';
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout = appendTail(stdout, text);
      progressBuffer += text;
      const lines = progressBuffer.split(/\r?\n/);
      progressBuffer = lines.pop() || '';
      for (const line of lines) {
        const match = line.match(/^out_time_ms=(\d+)/);
        if (match) report(Number(match[1]));
      }
    });

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Tempo de execução excedido (180s).'));
    }, 180 * 1000);
    const clearRenderTimeout = () => clearTimeout(timeout);
    const abort = () => {
      if (settled) return;
      child.kill('SIGTERM');
      const error = new Error('Processamento cancelado.');
      error.code = 'ABORT_ERR';
      settled = true;
      clearRenderTimeout();
      reject(error);
    };
    signal?.addEventListener('abort', abort, { once: true });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 20000) stderr = stderr.slice(-20000);
    });
    child.on('error', (err) => {
      clearRenderTimeout();
      signal?.removeEventListener('abort', abort);
      if (settled) return;
      settled = true;
      reject(new Error(`Falha ao executar FFmpeg: ${err.message}`));
    });
    child.on('close', (code) => {
      clearRenderTimeout();
      signal?.removeEventListener('abort', abort);
      if (settled) return;
      settled = true;
      if (code === 0) {
        if (typeof onProgress === 'function') onProgress({ progress: 100, elapsedSeconds: (Date.now() - startedAt) / 1000, estimatedRemainingSeconds: 0, speed: null, currentTimeMs: totalDurationMs, totalDurationMs });
        resolve({ code, stderr, stdout });
      } else {
        reject(new Error(`FFmpeg retornou código ${code}: ${stderr.slice(-500)}`));
      }
    });
  });
}

export function executeCut(inputPath, startMs, endMs, outputPath, options = {}) {
  const { onProgress, totalDurationMs, signal, ...ffmpegOptions } = options;
  return runFfmpeg([...buildCutCommand(inputPath, startMs, endMs, ffmpegOptions), outputPath], { onProgress, totalDurationMs, signal });
}

export function executePreview(inputPath, startMs, endMs, outputPath, options = {}) {
  return runFfmpeg([...buildPreviewCommand(inputPath, startMs, endMs, options), outputPath]);
}
