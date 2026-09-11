import { Router } from 'express';
import { checkFfmpeg } from '../system.js';
import { generateAllCuts } from '../worker/batch.js';

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

    const result = await generateAllCuts(req.params.name);
    res.json({
      ok: true,
      results: result.results,
      manifest: result.manifest,
    });
  } catch (err) {
    console.error('[ERROR]', err.message);
    res.status(400).json({ ok: false, error: err.message });
  }
});

export default router;