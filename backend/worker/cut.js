import path from 'node:path';
import { getProject, saveManifest, findCut, cutOutputFilename } from '../projects.js';
import { executeCut } from '../ffmpeg.js';

export async function generateCut(projectName, cutId) {
  const { dir, manifest } = await getProject(projectName);

  const found = findCut(manifest, cutId);
  if (!found) {
    throw new Error(`Corte ${cutId} não encontrado no projeto.`);
  }

  const { index, cut } = found;

  if (cut.status === 'PROCESSANDO') {
    throw new Error(`Corte ${cutId} já está em processamento.`);
  }

  const originalVideoPath = path.join(dir, manifest.sourceVideo);
  const outputFilename = cut.outputFilename || cutOutputFilename(index + 1, cut.title);
  const outputPath = path.join(dir, 'output', outputFilename);

  cut.status = 'PROCESSANDO';
  cut.error = '';
  await saveManifest(projectName, manifest);

  try {
    console.log(`[INFO] Processando corte ${String(index + 1).padStart(2, '0')}`);
    await executeCut(originalVideoPath, cut.startMs, cut.endMs, outputPath);
    cut.status = 'CONCLUÍDO';
    cut.output = outputFilename;
    cut.outputPath = outputPath;
    console.log(`[INFO] Corte ${String(index + 1).padStart(2, '0')} concluído`);
  } catch (err) {
    cut.status = 'ERRO';
    cut.error = err.message;
    console.error(`[ERROR] Corte ${String(index + 1).padStart(2, '0')} falhou: ${err.message}`);
  }

  await saveManifest(projectName, manifest);
  return { cut, manifest };
}