import { Router } from 'express';
import { checkFfmpeg } from '../system.js';
import { generateCut } from '../worker/cut.js';

const router = Router();

router.post('/projects/:name/cuts/:id/generate', async (req, res) => {
  try {
    const ffmpeg = await checkFfmpeg();
    if (!ffmpeg.available) {
      return res.status(400).json({
        ok: false,
        error: 'FFmpeg não encontrado. Configure o caminho do executável.',
      });
    }

    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ ok: false, error: 'ID de corte inválido.' });
    }

    const result = await generateCut(req.params.name, id);
    res.json({ ok: true, cut: result.cut });
  } catch (err) {
    console.error('[ERROR]', err.message);
    res.status(400).json({ ok: false, error: err.message });
  }
});

export default router;