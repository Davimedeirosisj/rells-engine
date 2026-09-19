import { Router } from 'express';
import { checkFfmpeg } from '../system.js';
import { generateAllCuts, isBatchRunning, cancelBatch } from '../worker/batch.js';
import { getProject } from '../projects.js';

const router = Router();

router.post('/projects/:name/generate-all', async (req, res) => {
  try {
    const ffmpeg = await checkFfmpeg();
    if (!ffmpeg.available) {
      return res.status(400).json({
        ok: false,
        error: 'FFmpeg não encontrado. Configure o caminho do executável.',
      });
    }

    await getProject(req.params.name);
    if (isBatchRunning(req.params.name)) {
      return res.status(409).json({ ok: false, error: 'Já existe um processamento em andamento para este projeto.' });
    }
    void generateAllCuts(req.params.name).catch((err) => {
      console.error('[ERROR] Processamento em lote:', err.message);
    });
    res.status(202).json({ ok: true, project: req.params.name, status: 'PROCESSING' });
  } catch (err) {
    console.error('[ERROR]', err.message);
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.delete('/projects/:name/generate-all', (req, res) => {
  if (!cancelBatch(req.params.name)) {
    return res.status(404).json({ ok: false, error: 'Nenhum processamento ativo para este projeto.' });
  }
  return res.status(202).json({ ok: true, project: req.params.name, status: 'CANCELLING' });
});

export default router;