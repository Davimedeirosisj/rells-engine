import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const whisperConfig = {
  model: process.env.WHISPER_MODEL || 'turbo',
  language: process.env.WHISPER_LANGUAGE || 'pt',
  outputFormat: process.env.WHISPER_OUTPUT_FORMAT || 'srt',
  timeoutMs: Number(process.env.WHISPER_TIMEOUT_MS) || 3600000,
};

export function whisperCandidateCommands() {
  const forced = process.env.WHISPER_COMMAND;
  if (forced && forced.trim()) {
    const useModule = process.env.WHISPER_MODULE === '1' || process.env.WHISPER_MODULE === 'true';
    return [{ program: forced.trim(), moduleArgs: useModule ? ['-m', 'whisper'] : [] }];
  }
  return [
    { program: 'whisper', moduleArgs: [] },
    { program: 'python', moduleArgs: ['-m', 'whisper'] },
    { program: 'py', moduleArgs: ['-m', 'whisper'] },
  ];
}

export function buildWhisperArgs(videoPath, outputDir, cfg = whisperConfig) {
  return [
    videoPath,
    '--model', cfg.model,
    '--language', cfg.language,
    '--output_format', cfg.outputFormat,
    '--output_dir', outputDir,
  ];
}

export function whisperOutputName(videoPath) {
  const base = path.basename(videoPath);
  const ext = path.extname(base);
  const stem = ext ? base.slice(0, -ext.length) : base;
  return `${stem}.srt`;
}

export function expectedSrtPath(videoPath, outputDir) {
  return path.join(outputDir, whisperOutputName(videoPath));
}

export function srtBlockCount(srtPath) {
  if (!fs.existsSync(srtPath)) return 0;
  const text = fs.readFileSync(srtPath, 'utf8');
  let count = 0;
  for (const line of text.split('\n')) {
    if (/^\d+$/.test(line.trim())) count++;
  }
  return count;
}

export function execWhisper({ program, moduleArgs = [], args = [], timeoutMs = whisperConfig.timeoutMs, spawnFn = spawn, onStderr } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      settled = true;
      if (child && typeof child.kill === 'function') child.kill();
      const err = new Error(`Whisper excedeu o tempo limite de ${timeoutMs}ms.`);
      err.code = 'WHISPER_TIMEOUT';
      err.stdout = stdout;
      err.stderr = stderr;
      reject(err);
    }, timeoutMs);

    try {
      child = spawnFn(program, [...moduleArgs, ...args], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      clearTimeout(timer);
      settled = true;
      err.code = err.code || 'WHISPER_SPAWN';
      err.stdout = stdout;
      err.stderr = stderr;
      reject(err);
      return;
    }

    if (child.stdout) child.stdout.on('data', (d) => { stdout += d.toString(); });
    if (child.stderr) child.stderr.on('data', (d) => {
      const text = d.toString();
      stderr += text;
      if (typeof onStderr === 'function') onStderr(text);
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      err.code = err.code || 'WHISPER_SPAWN';
      err.stdout = stdout;
      err.stderr = stderr;
      reject(err);
    });

    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      resolve({ exitCode, signal, stdout, stderr });
    });
  });
}

export async function checkWhisperAvailability({ spawnFn = spawn, timeoutMs = 20000 } = {}) {
  const candidates = whisperCandidateCommands();
  for (const cand of candidates) {
    try {
      const res = await execWhisper({
        program: cand.program,
        moduleArgs: cand.moduleArgs,
        args: ['--help'],
        timeoutMs,
        spawnFn,
      });
      if (res.exitCode !== null && res.exitCode >= 0 && res.exitCode <= 2) {
        return { available: true, program: cand.program, moduleArgs: cand.moduleArgs, stderr: res.stderr.slice(0, 500) };
      }
    } catch (err) {
      if (err && err.code === 'ENOENT') continue;
      continue;
    }
  }
  return { available: false, error: 'Whisper não encontrado. Instale o openai-whisper ou configure WHISPER_COMMAND no .env.' };
}

export async function findNewestSrt(dir) {
  const entries = await fs.promises.readdir(dir).catch(() => []);
  const srts = [];
  for (const f of entries) {
    if (f.toLowerCase().endsWith('.srt')) {
      const full = path.join(dir, f);
      const stat = await fs.promises.stat(full).catch(() => null);
      if (stat) srts.push({ path: full, mtime: stat.mtimeMs });
    }
  }
  if (!srts.length) return null;
  srts.sort((a, b) => b.mtime - a.mtime);
  return srts[0].path;
}

export async function transcribeVideo({ videoPath, outputDir, cfg = whisperConfig, spawnFn = spawn, onProgress } = {}) {
  if (!videoPath || !outputDir) throw new Error('videoPath e outputDir são obrigatórios para transcrição.');
  if (!fs.existsSync(videoPath)) throw new Error(`Vídeo não encontrado em: ${videoPath}`);
  if (!fs.existsSync(outputDir)) await fs.promises.mkdir(outputDir, { recursive: true });

  const availability = await checkWhisperAvailability({ spawnFn, timeoutMs: Math.min(cfg.timeoutMs, 20000) });
  if (!availability.available) {
    const err = new Error(availability.error);
    err.code = 'WHISPER_NOT_FOUND';
    throw err;
  }

  const args = buildWhisperArgs(videoPath, outputDir, cfg);
  let lastPercent = 0;
  const startedAt = Date.now();
  const reportStderr = (text) => {
    const percentMatches = [...String(text).matchAll(/(?:^|\s)(\d{1,3})%/g)];
    if (!percentMatches.length) return;
    const percent = Math.max(lastPercent, Math.min(99.9, Number(percentMatches.at(-1)[1])));
    if (percent <= lastPercent) return;
    lastPercent = percent;
    const elapsedSeconds = (Date.now() - startedAt) / 1000;
    const speed = percent > 0 ? percent / Math.max(elapsedSeconds, 0.1) : null;
    const estimatedRemainingSeconds = speed ? Math.max(0, (100 - percent) / speed) : null;
    if (typeof onProgress === 'function') onProgress({ progress: percent, elapsedSeconds, speed, estimatedRemainingSeconds });
  };

  let res;
  try {
    res = await execWhisper({
      program: availability.program,
      moduleArgs: availability.moduleArgs,
      args,
      timeoutMs: cfg.timeoutMs,
      spawnFn,
      onStderr: reportStderr,
    });
  } catch (err) {
    err.code = err.code || 'WHISPER_EXEC_FAILED';
    err.program = availability.program;
    err.model = cfg.model;
    err.language = cfg.language;
    throw err;
  }

  if (res.exitCode !== 0) {
    const err = new Error(`Whisper encerrou com código de saída ${res.exitCode}.`);
    err.code = 'WHISPER_NON_ZERO_EXIT';
    err.exitCode = res.exitCode;
    err.stdout = res.stdout;
    err.stderr = res.stderr;
    err.program = availability.program;
    err.model = cfg.model;
    err.language = cfg.language;
    throw err;
  }

  const expected = expectedSrtPath(videoPath, outputDir);
  let srtPath = expected;
  if (!fs.existsSync(expected)) {
    const fallback = await findNewestSrt(outputDir);
    if (fallback) {
      srtPath = fallback;
    } else {
      const err = new Error(`Whisper terminou com sucesso, mas o arquivo SRT esperado não foi criado em: ${expected}`);
      err.code = 'WHISPER_SRT_MISSING';
      err.stdout = res.stdout;
      err.stderr = res.stderr;
      err.expectedSrtPath = expected;
      throw err;
    }
  }

  if (typeof onProgress === 'function') onProgress({ progress: 100, elapsedSeconds: (Date.now() - startedAt) / 1000, speed: lastPercent > 0 ? lastPercent / Math.max((Date.now() - startedAt) / 1000, 0.1) : null, estimatedRemainingSeconds: 0 });
  return { srtPath, stdout: res.stdout, stderr: res.stderr, expectedSrtPath: expected };
}
