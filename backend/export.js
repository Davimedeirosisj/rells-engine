import fs from 'node:fs/promises';
import { existsSync, createWriteStream } from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';
import { getProject } from './projects.js';
import { sanitizeFilename } from './fs-utils.js';
import { config } from './config.js';

export function buildDeliveryManifest(manifest) {
  const cuts = (manifest.cuts || []).map((c) => ({
    id: c.id,
    title: c.title,
    theme: c.theme,
    coverHook: c.cover_hook || c.coverHook,
    start: c.start,
    end: c.end,
    status: c.status,
    output: c.status === 'CONCLUÍDO' ? c.output : null,
  }));

  return {
    project: manifest.project,
    preset: manifest.preset,
    exportedAt: new Date().toISOString(),
    engine: 'RELLS ENGINE',
    videoDurationMs: manifest.videoDurationMs,
    complete: cuts.filter((c) => c.status === 'CONCLUÍDO').length,
    total: cuts.length,
    cuts,
  };
}

export async function exportProjectZip(projectName) {
  const { dir, manifest } = await getProject(projectName);

  const outputDir = path.join(dir, 'output');
  const deliveryName = sanitizeFilename(manifest.project || projectName);
  const zipName = `${deliveryName}-cortes.zip`;
  const zipPath = path.join(dir, 'temp', zipName);

  const completed = (manifest.cuts || []).filter((c) => c.status === 'CONCLUÍDO');
  if (completed.length === 0) {
    throw new Error('Nenhum corte concluído para exportar.');
  }

  for (const cut of completed) {
    if (!cut.output) continue;
    const filePath = path.join(outputDir, cut.output);
    if (!existsSync(filePath)) {
      throw new Error(`Arquivo de saída ausente: ${cut.output}`);
    }
  }

  await fs.mkdir(path.dirname(zipPath), { recursive: true });

  const deliveryManifest = buildDeliveryManifest(manifest);

  await new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 6 } });
    const stream = createWriteStream(zipPath);

    stream.on('close', resolve);
    archive.on('error', reject);

    archive.pipe(stream);
    archive.append(JSON.stringify(deliveryManifest, null, 2), { name: 'manifest.json' });

    for (const cut of completed) {
      if (!cut.output) continue;
      archive.file(path.join(outputDir, cut.output), { name: path.join('cortes', cut.output) });
    }

    archive.finalize();
  });

  return { zipPath, zipName, completed: completed.length };
}