import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { sanitizeFilename, validateExtension } from './fs-utils.js';
import { getVideoDurationMs } from './system.js';
import { parseCortes, validateCuts } from './cortes.js';

export function parseProjectName(cortes) {
  const name = cortes?.project?.name;
  if (!name || typeof name !== 'string') {
    return null;
  }
  return sanitizeFilename(name);
}

export async function createProject({ name, videoFile, srtFile, cortesFile }) {
  const projectDir = path.join(config.dirs.projects, name);

  if (existsSync(projectDir)) {
    throw new Error(`Projeto "${name}" já existe. Exclua a pasta ou use outro nome.`);
  }

  await fs.mkdir(path.join(projectDir, 'output'), { recursive: true });
  await fs.mkdir(path.join(projectDir, 'temp'), { recursive: true });

  validateExtension(videoFile.originalname, 'video');
  validateExtension(srtFile.originalname, 'srt');
  validateExtension(cortesFile.originalname, 'json');

  const videoExt = path.extname(videoFile.originalname).toLowerCase();
  const srtExt = path.extname(srtFile.originalname).toLowerCase();

  const originalVideoPath = path.join(projectDir, `original${videoExt}`);
  const originalSrtPath = path.join(projectDir, `original${srtExt}`);
  const cortesPath = path.join(projectDir, 'cortes.json');

  await fs.copyFile(videoFile.path, originalVideoPath);
  await fs.copyFile(srtFile.path, originalSrtPath);
  await fs.copyFile(cortesFile.path, cortesPath);

  const cortesRaw = await fs.readFile(cortesPath, 'utf8');
  const cortes = parseCortes(cortesRaw);

  const videoDurationMs = await getVideoDurationMs(originalVideoPath);
  const validation = validateCuts(cortes, videoDurationMs);

  const manifest = {
    project: cortes?.project?.name || name,
    preset: cortes?.preset || null,
    sourceVideo: `original${videoExt}`,
    sourceSrt: `original${srtExt}`,
    importedAt: new Date().toISOString(),
    videoDurationMs,
    cuts: validation.valid.map((c) => ({
      id: c.id,
      start: c.start,
      end: c.end,
      startMs: c.startMs,
      endMs: c.endMs,
      title: c.title,
      theme: c.theme,
      cover_hook: c.cover_hook,
      status: 'PENDENTE',
    })),
    validationErrors: validation.errors,
  };

  await fs.writeFile(path.join(projectDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  return {
    name,
    dir: projectDir,
    files: {
      video: originalVideoPath,
      srt: originalSrtPath,
      cortes: cortesPath,
      manifest: path.join(projectDir, 'manifest.json'),
    },
    cortes,
    videoDurationMs,
    validation,
  };
}