import path from 'node:path';
import { existsSync } from 'node:fs';
import { getProject, saveManifest, findCut, cutOutputFilename } from '../projects.js';
import { executeCut } from '../ffmpeg.js';
import { config } from '../config.js';
import { validateRenderedMp4 } from '../validate.js';

function assertFontAvailable() {
  if (!existsSync(config.fontPath)) {
    throw new Error(
      `Fonte não encontrada em ${config.fontPath}. Adicione o arquivo Gobold-Bold.ttf para processar.`,
    );
  }
}
export async function processCut(dir, manifest, cut, index, progress = {}) {
  const originalVideoPath = path.join(dir, manifest.sourceVideo);
  const outputFilename = cut.outputFilename || cutOutputFilename(index + 1, cut.title);
  const outputPath = path.join(dir, 'output', outputFilename);

  cut.status = 'PROCESSANDO';
  cut.error = '';

  try {
    await executeCut(originalVideoPath, cut.startMs, cut.endMs, outputPath, {
      theme: cut.theme,
      handle: config.profileHandle,
      avatarPath: config.avatarPath,
      verificationPath: config.verificationPath,
      totalDurationMs: Math.max(1, cut.endMs - cut.startMs),
      onProgress: progress.onProgress,
    });
    const validation = await validateRenderedMp4(outputPath, {
      startMs: cut.startMs,
      endMs: cut.endMs,
    });
    if (!validation.ok) {
      cut.status = 'ERRO';
      cut.error = `Falha na validação do MP4: ${validation.issues.join(' | ')}`;
      cut.output = '';
      cut.outputPath = '';
      return cut;
    }
    cut.status = 'CONCLUÍDO';
    cut.output = outputFilename;
    cut.outputPath = outputPath;
  } catch (err) {
    cut.status = 'ERRO';
    cut.error = err.message;
  }

  return cut;
}

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

  assertFontAvailable();

  console.log(`[INFO] Processando corte ${String(index + 1).padStart(2, '0')}`);
  await processCut(dir, manifest, cut, index);
  if (cut.status === 'CONCLUÍDO') {
    console.log(`[INFO] Corte ${String(index + 1).padStart(2, '0')} concluído`);
  } else {
    console.error(`[ERROR] Corte ${String(index + 1).padStart(2, '0')} falhou: ${cut.error}`);
  }

  await saveManifest(projectName, manifest);
  return { cut, manifest };
}