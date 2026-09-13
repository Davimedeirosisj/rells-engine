import { Router } from 'express';
import { getTranscriptionStatus, startTranscription } from '../transcription.js';
import { getProgress } from '../progress.js';

const router = Router();

router.get('/projects/:name/transcription', async (req, res) => {
  try {
    const transcription = await getTranscriptionStatus(req.params.name);
    res.json({ ok: true, project: req.params.name, transcription });
  } catch (err) {
    console.error('[ERROR] Status da transcrição:', err.message);
    res.status(404).json({ ok: false, project: req.params.name, error: err.message });
  }
});

router.get('/projects/:name/progress', async (req, res) => {
  try {
    res.json({ ok: true, project: req.params.name, progress: getProgress(req.params.name) });
  } catch (err) {
    res.status(404).json({ ok: false, project: req.params.name, error: err.message });
  }
});

router.post('/projects/:name/transcription', async (req, res) => {
  try {
    const transcription = await startTranscription(req.params.name);
    const status = transcription.status === 'ERROR' ? 400 : 202;
    res.status(status).json({ ok: status < 400, project: req.params.name, transcription });
  } catch (err) {
    console.error('[ERROR] Início da transcrição:', err.message);
    res.status(400).json({ ok: false, project: req.params.name, error: err.message });
  }
});

export default router;
