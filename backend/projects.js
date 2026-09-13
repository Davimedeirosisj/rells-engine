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
      const validCuts = (manifest.cuts || []).length;
      const invalidCuts = (manifest.validationErrors || []).length;
      const srtReady = manifest.transcription?.status === 'SRT_READY';
      projects.push({
        name: entry.name,
        title: manifest.project || entry.name,
        sourceVideo: manifest.sourceVideo || null,
        sourceSrt: manifest.sourceSrt || (srtReady ? 'transcription-ready' : null),
        cutCount: validCuts,
        totalCuts: validCuts,
        validCuts,
        invalidCuts,
        importedAt: manifest.importedAt,
      });
    } catch {
      projects.push({ name: entry.name, title: entry.name, sourceVideo: null, sourceSrt: null, cutCount: 0, totalCuts: 0, validCuts: 0, invalidCuts: 0 });
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
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
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
