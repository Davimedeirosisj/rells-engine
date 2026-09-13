import { getProject, saveManifest } from '../projects.js';
import { processCut } from './cut.js';
import { setProgress } from '../progress.js';

export async function generateAllCuts(projectName, processor = processCut) {
  const { dir, manifest } = await getProject(projectName);

  const cuts = manifest.cuts || [];
  const results = { total: cuts.length, completed: 0, failed: 0, skipped: 0, cuts: [] };
  const batchStartedAt = Date.now();
  let completedBefore = 0;

  setProgress(projectName, {
    status: 'PROCESSING', stage: 'FFMPEG', progress: 0, currentCut: 0, totalCuts: cuts.length,
    currentTitle: null, elapsedSeconds: 0, estimatedRemainingSeconds: null,
    message: `Preparando ${cuts.length} cortes…`, startedAt: new Date().toISOString(),
  });

  for (let i = 0; i < cuts.length; i++) {
    const cut = cuts[i];
    if (cut.status === 'CONCLUÍDO') {
      results.skipped += 1;
      completedBefore += 1;
      results.cuts.push({ id: cut.id, status: 'CONCLUÍDO', error: '' });
      setProgress(projectName, { currentCut: i + 1, totalCuts: cuts.length, progress: ((i + 1) / Math.max(cuts.length, 1)) * 100, currentTitle: cut.title, message: `Corte ${i + 1} de ${cuts.length} já estava concluído.` });
      continue;
    }

    if (cut.status === 'PROCESSANDO') continue;

    cut.status = 'PROCESSANDO';
    cut.error = '';
    console.log(`[INFO] Processando corte ${String(i + 1).padStart(2, '0')} de ${cuts.length}`);

    const cutStartedAt = Date.now();
    try {
      await processor(dir, manifest, cut, i, {
        onProgress: ({ progress = 0, elapsedSeconds = 0, estimatedRemainingSeconds = null, speed = null }) => {
          const overall = ((completedBefore + progress / 100) / Math.max(cuts.length, 1)) * 100;
          const elapsedTotal = (Date.now() - batchStartedAt) / 1000;
          const remainingCuts = Math.max(0, cuts.length - (completedBefore + progress / 100));
          const eta = remainingCuts > 0 && elapsedTotal > 0 ? (elapsedTotal / Math.max(completedBefore + progress / 100, 0.01)) * remainingCuts : estimatedRemainingSeconds;
          setProgress(projectName, {
            status: 'PROCESSING', stage: 'FFMPEG', progress: overall, currentCut: i + 1, totalCuts: cuts.length,
            currentTitle: cut.title, elapsedSeconds: elapsedTotal, estimatedRemainingSeconds: eta,
            speed, currentTimeMs: null, totalDurationMs: cut.endMs - cut.startMs,
            message: `Renderizando corte ${i + 1} de ${cuts.length}…`,
          });
        },
      });
      await saveManifest(projectName, manifest);
      if (cut.status === 'CONCLUÍDO') {
        results.completed += 1;
        completedBefore += 1;
        console.log(`[INFO] Corte ${String(i + 1).padStart(2, '0')} concluído`);
      } else {
        results.failed += 1;
      }
    } catch (err) {
      cut.status = 'ERRO';
      cut.error = err.message;
      await saveManifest(projectName, manifest);
      results.failed += 1;
      console.error(`[ERROR] Corte ${String(i + 1).padStart(2, '0')} falhou: ${err.message}`);
    }

    results.cuts.push({ id: cut.id, status: cut.status, error: cut.error || '' });
    if (cut.status === 'CONCLUÍDO') {
      setProgress(projectName, { progress: ((i + 1) / Math.max(cuts.length, 1)) * 100, currentCut: i + 1, totalCuts: cuts.length, currentTitle: cut.title, message: `Corte ${i + 1} de ${cuts.length} concluído.`, elapsedSeconds: (Date.now() - batchStartedAt) / 1000 });
    }
    void cutStartedAt;
  }

  const elapsedSeconds = (Date.now() - batchStartedAt) / 1000;
  const finalStatus = results.failed ? 'ERROR' : 'COMPLETED';
  setProgress(projectName, {
    status: finalStatus, stage: 'READY', progress: 100, currentCut: cuts.length, totalCuts: cuts.length,
    currentTitle: null, elapsedSeconds, estimatedRemainingSeconds: 0,
    message: results.failed ? `${results.failed} corte(s) falharam.` : `${results.completed + results.skipped} cortes concluídos.`,
  });

  return { manifest, results };
}