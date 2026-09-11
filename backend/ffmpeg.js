import { spawn } from 'node:child_process';
import { getFfmpegBin } from './system.js';
import { buildVideoFilter } from './filter.js';
import { config } from './config.js';

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

export function buildCutCommand(inputPath, startMs, endMs, { theme = '', handle, avatarPath, verificationPath } = {}) {
  const start = msToFfmpegTime(startMs);
  const end = msToFfmpegTime(endMs);

  const { filter, extraInputs } = buildVideoFilter({
    theme,
    fontPath: config.fontPath,
    handle,
    avatarPath,
    verificationPath,
  });

  const args = ['-y', '-ss', start, '-to', end, '-i', inputPath];

  for (const extra of extraInputs) {
    args.push('-i', extra);
  }

  args.push(
    '-filter_complex', filter,
    '-map', '[v]',
    '-map', '0:a:0',
    '-r', '30',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '18',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
  );

  return args;
}

export function buildPreviewCommand(inputPath, startMs, endMs, { theme = '', handle, avatarPath, verificationPath, durationMs } = {}) {
  const start = msToFfmpegTime(startMs);
  const previewDuration = durationMs || Math.min(endMs - startMs, 3000);

  const { filter, extraInputs } = buildVideoFilter({
    theme,
    fontPath: config.fontPath,
    handle,
    avatarPath,
    verificationPath,
  });

  const args = ['-y', '-ss', start, '-t', msToFfmpegTime(previewDuration), '-i', inputPath];

  for (const extra of extraInputs) {
    args.push('-i', extra);
  }

  args.push(
    '-filter_complex', filter,
    '-map', '[v]',
    '-map', '0:a:0',
    '-r', '30',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '32',
    '-c:a', 'aac',
    '-b:a', '96k',
    '-movflags', '+faststart',
  );

  return args;
}

export function runFfmpeg(args) {
  const bin = getFfmpegBin();
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args);
    let stderr = '';

    // Add timeout (180s for long renders)
    setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Tempo de execução excedido (180s).'));
    }, 180 * 1000);

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 20000) {
        stderr = stderr.slice(-20000);
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Falha ao executar FFmpeg: ${err.message}`));
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ code, stderr });
      } else {
        reject(new Error(`FFmpeg retornou código ${code}: ${stderr.slice(-500)}`));
      }
    });
  });
}

export function executeCut(inputPath, startMs, endMs, outputPath, options = {}) {
  return runFfmpeg([...buildCutCommand(inputPath, startMs, endMs, options), outputPath]);
}

export function executePreview(inputPath, startMs, endMs, outputPath, options = {}) {
  return runFfmpeg([...buildPreviewCommand(inputPath, startMs, endMs, options), outputPath]);
}