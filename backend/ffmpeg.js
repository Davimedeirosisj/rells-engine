import { spawn } from 'node:child_process';
import { getFfmpegBin } from './system.js';

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

export function buildCutCommand(inputPath, startMs, endMs) {
  const start = msToFfmpegTime(startMs);
  const end = msToFfmpegTime(endMs);

  return [
    '-y',
    '-ss', start,
    '-to', end,
    '-i', inputPath,
    '-map', '0:v:0',
    '-map', '0:a:0',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '18',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
  ];
}

export function executeCut(inputPath, startMs, endMs, outputPath) {
  const bin = getFfmpegBin();
  const args = [...buildCutCommand(inputPath, startMs, endMs), outputPath];

  return new Promise((resolve, reject) => {
    const child = spawn(bin, args);
    let stderr = '';

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