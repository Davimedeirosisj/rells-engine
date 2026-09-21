import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { safeJoin, sanitizeFilename } from './fs-utils.js';

export async function listProjects() {
  const root = config.dirs.projects;
  if (!existsSync(root)) return [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  const projects = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(root, entry.name, 'manifest.json');
    if (!existsSync(manifestPath)) continue;
    try {
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
      const cuts = manifest.cuts || [];
      const validCuts = cuts.length;
      const invalidCuts = (manifest.validationErrors || []).length;
      const srtReady = manifest.transcription?.status === 'SRT_READY';
      const completedCuts = cuts.filter((c) => String(c.status || '').toUpperCase() === 'CONCLUÍDO').length;
      const errorCuts = cuts.filter((c) => String(c.status || '').toUpperCase() === 'ERRO').length;
      const pendingCuts = validCuts - completedCuts - errorCuts;
      const transcribing = manifest.transcription?.status === 'TRANSCRIBING';
      projects.push({
        name: entry.name,
        title: manifest.project || entry.name,
        sourceVideo: manifest.sourceVideo || null,
        sourceSrt: manifest.sourceSrt || (srtReady ? 'transcription-ready' : null),
        cutCount: validCuts,
        totalCuts: validCuts,
        validCuts,
        invalidCuts,
        completedCuts,
        pendingCuts,
        errorCuts,
        transcribing,
        videoDurationMs: manifest.videoDurationMs || null,
        importedAt: manifest.importedAt,
      });
    } catch {
      projects.push({ name: entry.name, title: entry.name, sourceVideo: null, sourceSrt: null, cutCount: 0, totalCuts: 0, validCuts: 0, invalidCuts: 0, completedCuts: 0, pendingCuts: 0, errorCuts: 0, transcribing: false, videoDurationMs: null, importedAt: null });
    }
  }
  projects.sort((a, b) => String(b.importedAt || '').localeCompare(String(a.importedAt || '')));
  return projects;
}

export async function getProject(name) {
  const projectDir = safeJoin(config.dirs.projects, name);
  const manifestPath = path.join(projectDir, 'manifest.json');
  if (!existsSync(manifestPath)) throw new Error(`Projeto "${name}" não encontrado.`);
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  return { name, dir: projectDir, manifest };
}

export async function saveManifest(name, manifest) {
  const projectDir = safeJoin(config.dirs.projects, name);
  const manifestPath = path.join(projectDir, 'manifest.json');
  const tempPath = `${manifestPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(tempPath, JSON.stringify(manifest, null, 2), 'utf8');
    await fs.rename(tempPath, manifestPath);
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => {});
  }
  return manifest;
}

export function cutOutputFilename(index, title) {
  const num = String(index).padStart(2, '0');
  return `${num} - ${sanitizeFilename(title)}.mp4`;
}

export function findCut(manifest, id) {
  const index = (manifest.cuts || []).findIndex((c) => c.id === id);
  return index === -1 ? null : { index, cut: manifest.cuts[index] };
}
