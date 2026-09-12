import { Router } from 'express';
import multer from 'multer';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createProject, defaultProjectName } from '../project.js';
import { startTranscription } from '../transcription.js';

const router = Router();

const upload = multer({
  dest: path.join(os.tmpdir(), 'rells-engine-uploads'),
  limits: { fileSize: 10 * 1024 * 1024 * 1024 },
});

router.post('/import', upload.fields([{ name: 'video', maxCount: 1 }]), async (req, res) => {
  const videoFile = req.files?.video?.[0];

  try {
    if (!videoFile) return res.status(400).json({ ok: false, error: 'Arquivo de video nao enviado.' });

    const name = req.body.name || defaultProjectName();
    const project = await createProject({ name, videoFile, srtFile: null, cortesFile: null });
    const transcription = await startTranscription(project.name);

    console.log('[INFO] Projeto importado:', project.name);
    console.log(`[INFO] Duracao: ${project.videoDurationMs} ms`);
    console.log(`[INFO] Transcricao: ${transcription.status}`);

    return res.json({
      ok: true,
      project,
      cuts: null,
      transcription,
      cutsSummary: { total: 0, valid: 0, errors: [] },
      validationErrors: [],
    });
  } catch (err) {
    console.error('[ERROR] Importacao:', err.message);
    const status = /já existe|existe|nao enviado|não enviado|extens|inválid|invalido/i.test(err.message) ? 400 : 500;
    return res.status(status).json({ ok: false, error: err.message });
  } finally {
    if (videoFile?.path) await fs.rm(videoFile.path, { force: true }).catch(() => {});
  }
});

export default router;
