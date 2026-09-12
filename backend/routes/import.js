import { Router } from 'express';
import multer from 'multer';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createProject, parseProjectName, defaultProjectName } from '../project.js';
import { parseCortes } from '../cortes.js';

const router = Router();

const upload = multer({
  dest: path.join(os.tmpdir(), 'rells-engine-uploads'),
  limits: { fileSize: 10 * 1024 * 1024 * 1024 }, // 10GB max
});

const fields = [
  { name: 'video', maxCount: 1 },
];

router.post('/import', upload.fields(fields), async (req, res) => {
  const files = req.files || {};
  const videoFile = files.video?.[0];
  const srtFile = undefined;
  const cortesFile = undefined;
  const nameFromForm = req.body.name;

  try {
    if (!videoFile) throw new Error('Arquivo de video nao enviado.');

    let name = nameFromForm || defaultProjectName();

    const project = await createProject({ name, videoFile, srtFile, cortesFile });

    console.log('[INFO] Projeto importado:', name);
    console.log(`[INFO] Duracao: ${project.videoDurationMs} ms`);

    res.json({
      project,
      cuts: null,
      transcription: null,
      cutsSummary: { total: 0, valid: 0, errors: [] },
      validationErrors: [],
    });
  } catch (err) {
    console.error('[ERROR] Importacao:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
