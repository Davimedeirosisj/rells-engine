import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import { config } from './config.js';

const execFileAsync = promisify(execFile);

const BIN = (name, envPath) => {
  if (envPath && envPath.trim()) {
    return envPath.trim();
  }
  return name;
};

export function getFfmpegBin() {
  return BIN('ffmpeg', config.ffmpegPath);
}

export async function checkFfmpeg() {
  const bin = BIN('ffmpeg', config.ffmpegPath);
  try {
    const { stdout } = await execFileAsync(bin, ['-version'], { timeout: 10000 });
    const firstLine = (stdout || '').split('\n')[0] || '';
    return {
      available: true,
      path: bin,
      version: firstLine,
    };
  } catch (err) {
    return {
      available: false,
      path: bin,
      error: err.message || String(err),
    };
  }
}

export async function checkFfprobe() {
  const bin = BIN('ffprobe', config.ffprobePath);
  try {
    await execFileAsync(bin, ['-version'], { timeout: 10000 });
    return { available: true, path: bin };
  } catch (err) {
    return {
      available: false,
      path: bin,
      error: err.message || String(err),
    };
  }
}

export function checkFont() {
  return {
    exists: fs.existsSync(config.fontPath),
    path: config.fontPath,
  };
}

export async function getVideoDurationMs(videoPath) {
  const bin = BIN('ffprobe', config.ffprobePath);
  const args = [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    videoPath,
  ];
  try {
    const { stdout } = await execFileAsync(bin, args, { timeout: 30000 });
    const seconds = parseFloat(stdout.trim());
    if (!Number.isFinite(seconds)) {
      throw new Error('Duração não detectada.');
    }
    return Math.round(seconds * 1000);
  } catch (err) {
    throw new Error(`Não foi possível obter a duração do vídeo: ${err.message}`);
  }
}