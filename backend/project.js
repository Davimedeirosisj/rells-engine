import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { sanitizeProjectName, safeJoin, validateExtension } from './fs-utils.js';
import { getVideoDurationMs } from './system.js';
import { parseCortes, validateCuts, validateCutsAgainstSrt } from './cortes.js';
import { getProject, saveManifest } from './projects.js';

export function defaultProjectName(date = new Date()) {
  const pretty = date.toLocaleDateString('pt-BR');
  return sanitizeProjectName(`Projeto ${pretty}`, { fallback: 'Projeto-Importado' });
}

export function parseProjectName(cortes) {
  const name = cortes?.project?.name;
  if (!name || typeof name !== 'string') return null;
  return sanitizeProjectName(name, { fallback: '' }) || null;
}

export async function createProject({ name, videoFile, srtFile, cortesFile }) {
  if (!videoFile?.path || !videoFile?.originalname) throw new Error('Arquivo de video nao enviado.');

  const safeName = sanitizeProjectName(name, { fallback: 'projeto' });
  const projectDir = safeJoin(config.dirs.projects, safeName);
  if (existsSync(projectDir)) throw new Error(`Projeto "${safeName}" já existe. Exclua a pasta ou use outro nome.`);

  validateExtension(videoFile.originalname, 'video');
  if (srtFile) validateExtension(srtFile.originalname, 'srt');
  if (cortesFile) validateExtension(cortesFile.originalname, 'json');

  const videoExt = path.extname(videoFile.originalname).toLowerCase();
  const originalVideoPath = path.join(projectDir, `original${videoExt}`);
  const originalSrtPath = srtFile ? path.join(projectDir, 'original.srt') : null;
  const cortesPath = path.join(projectDir, 'cortes.json');
  const manifestPath = path.join(projectDir, 'manifest.json');

  try {
    await fs.mkdir(path.join(projectDir, 'output'), { recursive: true });
    await fs.mkdir(path.join(projectDir, 'temp'), { recursive: true });
    await fs.copyFile(videoFile.path, originalVideoPath);
    if (srtFile) await fs.copyFile(srtFile.path, originalSrtPath);
    if (cortesFile) await fs.copyFile(cortesFile.path, cortesPath);

    let cortes = null;
    if (cortesFile) cortes = parseCortes(await fs.readFile(cortesPath, 'utf8'));

    const videoDurationMs = await getVideoDurationMs(originalVideoPath);
    const validation = cortes ? validateCuts(cortes, videoDurationMs) : { valid: [], errors: [] };

    const manifest = {
      project: cortes?.project?.name || safeName,
      preset: cortes?.preset || null,
      sourceVideo: `original${videoExt}`,
      sourceSrt: srtFile ? 'original.srt' : null,
      importedAt: new Date().toISOString(),
      videoDurationMs,
      cuts: validation.valid.map((c) => ({
        id: c.id, start: c.start, end: c.end, startMs: c.startMs, endMs: c.endMs,
        title: c.title, theme: c.theme, cover_hook: c.cover_hook, speech: c.speech || '', status: 'PENDENTE',
      })),
      validationErrors: validation.errors,
    };

    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    return {
      name: safeName, dir: projectDir,
      files: { video: originalVideoPath, srt: originalSrtPath, cortes: cortesPath, manifest: manifestPath },
      cortes, videoDurationMs, validation,
    };
  } catch (err) {
    await fs.rm(projectDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}

export async function importCutsIntoProject(projectName, cortesRaw) {
  const { dir, manifest } = await getProject(projectName);
  const videoPath = path.join(dir, manifest.sourceVideo || 'original.mp4');
  if (!existsSync(videoPath)) throw new Error('Projeto não possui vídeo original para validar os cortes.');

  const srtPath = path.join(dir, 'original.srt');
  if (!existsSync(srtPath)) throw new Error('Projeto não possui original.srt pronto. Transcreva o vídeo antes de importar cortes.');

  // The project is already identified by /projects/:name, so bind that
  // route value to the uploaded JSON instead of requiring duplicate metadata.
  const cortes = parseCortes(cortesRaw, { projectName });
  if (!Array.isArray(cortes.cuts) || cortes.cuts.length === 0) throw new Error('cortes.json não possui cortes na lista "cuts".');

  const baseValidation = validateCuts(cortes, manifest.videoDurationMs);
  const srtValidation = validateCutsAgainstSrt(baseValidation.valid, srtPath);
  const errors = [...baseValidation.errors, ...srtValidation.errors];
  const cuts = srtValidation.cuts.map((c) => ({
    id: c.id, start: c.start, end: c.end, startMs: c.startMs, endMs: c.endMs,
    title: c.title, theme: c.theme, cover_hook: c.cover_hook, speech: c.speech || '',
    ...(c.srt_block !== undefined ? { srt_block: c.srt_block } : {}),
    ...(c.speech_timestamps !== undefined ? { speech_timestamps: c.speech_timestamps } : {}),
    status: 'PENDENTE',
  }));

  await fs.writeFile(path.join(dir, 'cortes.json'), JSON.stringify(cortes, null, 2), 'utf8');
  manifest.cuts = cuts;
  manifest.validationErrors = errors;
  manifest.cutsImportedAt = new Date().toISOString();
  await saveManifest(projectName, manifest);

  return { project: projectName, total: cortes.cuts.length, valid: cuts.length, errors };
}
