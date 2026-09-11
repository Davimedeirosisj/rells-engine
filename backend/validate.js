import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import { config } from './config.js';

const execFileAsync = promisify(execFile);

const EXPECTED_WIDTH = 1080;
const EXPECTED_HEIGHT = 1920;

export function ffprobeBin() {
  return (config.ffprobePath && config.ffprobePath.trim()) || 'ffprobe';
}

async function defaultProbe(outputPath) {
  const { stdout } = await execFileAsync(
    ffprobeBin(),
    ['-v', 'error', '-show_entries', 'stream=codec_name,codec_type,width,height,r_frame_rate:format=duration:format=size', '-of', 'json', outputPath],
    { timeout: 30000 },
  );
  return JSON.parse(stdout);
}

export async function validateRenderedMp4(outputPath, { startMs = 0, endMs = 0, probe } = {}) {
  const issues = [];

  if (!outputPath) {
    return { ok: false, issues: ['Caminho de saída ausente.'] };
  }
  if (!fs.existsSync(outputPath)) {
    return { ok: false, issues: [`Arquivo não existe: ${outputPath}`] };
  }
  const stat = fs.statSync(outputPath);
  if (stat.size === 0) {
    return { ok: false, issues: ['Arquivo de saída está vazio (0 bytes).'] };
  }

  let probeData;
  const runProbe = probe || defaultProbe;
  try {
    probeData = await runProbe(outputPath);
  } catch (err) {
    return {
      ok: false,
      issues: [`Falha ao validar saída com ffprobe: ${err.message}`],
    };
  }

  const streams = (probeData && probeData.streams) || [];
  const video = streams.find((s) => s.codec_type === 'video');
  const format = probeData && probeData.format ? probeData.format : {};

  if (!video) {
    issues.push('Sem stream de vídeo no MP4 renderizado.');
  } else {
    if (video.codec_name !== 'h264' && video.codec_name !== 'libx264') {
      issues.push(`Codec de vídeo inesperado: ${video.codec_name} (esperado h264).`);
    }
    if (video.width !== EXPECTED_WIDTH && video.width !== undefined) {
      issues.push(`Largura inesperada: ${video.width} (esperado ${EXPECTED_WIDTH}).`);
    }
    if (video.height !== EXPECTED_HEIGHT && video.height !== undefined) {
      issues.push(`Altura inesperada: ${video.height} (esperado ${EXPECTED_HEIGHT}).`);
    }
  }

  if (!streams.some((s) => s.codec_type === 'audio')) {
    issues.push('Sem stream de áudio no MP4 renderizado.');
  }

  const duration = Number(format.duration);
  const expectedSec = (endMs - startMs) / 1000;
  if (!Number.isFinite(duration) || duration <= 0) {
    issues.push(`Duração inválida no container: ${format.duration}.`);
  } else if (expectedSec > 0) {
    const delta = Math.abs(duration - expectedSec);
    if (delta > 0.6) {
      issues.push(`Duração não confere (${duration.toFixed(2)}s vs ${expectedSec.toFixed(2)}s esperado).`);
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    size: stat.size,
    durationSec: Number.isFinite(duration) ? duration : null,
  };
}