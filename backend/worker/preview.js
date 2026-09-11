import path from 'node:path';
import { existsSync } from 'node:fs';
import { getProject, findCut } from '../projects.js';
import { executePreview } from '../ffmpeg.js';
import { config } from '../config.js';

export async function generatePreview(projectName, cutId) {
  const { dir, manifest } = await getProject(projectName);

  const found = findCut(manifest, cutId);
  if (!found) {
    throw new Error(`Corte ${cutId} não encontrado no projeto.`);
  }

  const { cut } = found;

  if (!existsSync(config.fontPath)) {
    throw new Error(
      `Fonte não encontrada em ${config.fontPath}. Adicione o arquivo Gobold-Bold.ttf para gerar o preview.`,
    );
  }

  const originalVideoPath = path.join(dir, manifest.sourceVideo);
  const tempDir = path.join(dir, 'temp');
  const previewFilename = `preview-${cutId}.mp4`;
  const previewPath = path.join(tempDir, previewFilename);

  console.log(`[INFO] Gerando preview do corte ${cutId}`);
  await executePreview(originalVideoPath, cut.startMs, cut.endMs, previewPath, {
    theme: cut.theme,
    handle: config.profileHandle,
    avatarPath: config.avatarPath,
    verificationPath: config.verificationPath,
  });
  console.log(`[INFO] Preview do corte ${cutId} concluído`);

  return {
    cutId,
    previewFilename,
    url: `/media/${encodeURIComponent(projectName)}/temp/${previewFilename}`,
  };
}