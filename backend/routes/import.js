import { Router } from 'express';
import multer from 'multer';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createProject, parseProjectName } from '../project.js';
import { parseCortes } from '../cortes.js';

const router = Router();

const upload = multer({
  dest: path.join(os.tmpdir(), 'rells-engine-uploads'),
  limits: { fileSize: 10 * 1024 * 1024 * 1024 },
});

const fields = [
  { name: 'video', maxCount: 1 },
  { name: 'srt', maxCount: 1 },
  { name: 'cortes', maxCount: 1 },
];

router.post('/import', upload.fields(fields), async (req, res) => {
  const files = req.files || {};

  const videoFile = files.video?.[0];
  const srtFile = files.srt?.[0];
  const cortesFile = files.cortes?.[0];

  try {
    if (!videoFile) throw new Error('Arquivo de vídeo não enviado.');
    if (!srtFile) throw new Error('Arquivo SRT não enviado.');
    if (!cortesFile) throw new Error('Arquivo cortes.json não enviado.');

    let cortes;
    try {
      cortes = parseCortes(await fs.readFile(cortesFile.path, 'utf8'));
    } catch (err) {
      throw new Error(err.message);
    }

    const name = parseProjectName(cortes);
    if (!name) {
      throw new Error('cortes.json não possui o campo "project.name".');
    }

    const project = await createProject({ name, videoFile, srtFile, cortesFile });

    console.log('[INFO] Projeto importado:', name);
    console.log(`[INFO] Duração: ${project.videoDurationMs} ms`);
    console.log(`[INFO] ${cortes.cuts.length} cortes encontrados`);
    console.log(`[INFO] Válidos: ${project.validation.valid.length} | Erros: ${project.validation.errors.length}`);
    for (const e of project.validation.errors) {
      console.log(`[ERROR] ${e}`);
    }

    res.status(201).json({
      ok: true,
      project: { name, dir: project.dir },
      cuts: {
        total: cortes.cuts.length,
        valid: project.validation.valid.length,
        errors: project.validation.errors,
      },
    });
  } catch (err) {
    console.error('[ERROR] Falha na importação:', err.message);
    res.status(400).json({ ok: false, error: err.message });
  } finally {
    for (const list of Object.values(files)) {
      for (const f of list) {
        fs.rm(f.path, { force: true }).catch(() => {});
      }
    }
  }
});

export default router;