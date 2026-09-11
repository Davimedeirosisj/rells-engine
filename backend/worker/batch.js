import { existsSync } from 'node:fs';
import { getProject, saveManifest } from '../projects.js';
import { processCut } from './cut.js';
import { config } from '../config.js';

export async function generateAllCuts(projectName, processor = processCut) {
  const { dir, manifest } = await getProject(projectName);

  if (!existsSync(config.fontPath)) {
    throw new Error(
      `Fonte não encontrada em ${config.fontPath}. Adicione o arquivo Gobold-Bold.ttf para processar.`,
    );
  }

  const cuts = manifest.cuts || [];
  const results = { total: cuts.length, completed: 0, failed: 0, skipped: 0, cuts: [] };

  for (let i = 0; i < cuts.length; i++) {
    const cut = cuts[i];

    if (cut.status === 'CONCLUÍDO') {
      results.skipped += 1;
      results.cuts.push({ id: cut.id, status: 'CONCLUÍDO', error: '' });
      continue;
    }

    if (cut.status === 'PROCESSANDO') {
      continue;
    }

    console.log(`[INFO] Processando corte ${String(i + 1).padStart(2, '0')} de ${cuts.length}`);

    await processor(dir, manifest, cut, i);
    await saveManifest(projectName, manifest);

    if (cut.status === 'CONCLUÍDO') {
      results.completed += 1;
      console.log(`[INFO] Corte ${String(i + 1).padStart(2, '0')} concluído`);
    } else {
      results.failed += 1;
      console.error(`[ERROR] Corte ${String(i + 1).padStart(2, '0')} falhou: ${cut.error}`);
    }

    results.cuts.push({ id: cut.id, status: cut.status, error: cut.error || '' });
  }

  return { manifest, results };
}