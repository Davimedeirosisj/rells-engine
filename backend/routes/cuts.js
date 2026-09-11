import { Router } from 'express';
import multer from 'multer';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { checkFfmpeg } from '../system.js';
import { generateCut } from '../worker/cut.js';
import { importCutsIntoProject } from '../project.js';
import { validateExtension } from '../fs-utils.js';

const router = Router();

const upload = multer({
  dest: path.join(os.tmpdir(), 'rells-engine-uploads-cuts'),
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.post('/projects/:name/cuts/import', upload.single('cortes'), async (req, res) => {
  try {
    if (!req.file) {
      throw new Error('Arquivo cortes.json não enviado.');
    }
    validateExtension(req.file.originalname, 'json');

    const raw = await fs.readFile(req.file.path, 'utf8');
    const result = await importCutsIntoProject(req.params.name, raw);

    const ok = result.errors.length === 0;
    res.json({
      ok,
      project: result.project,
      cuts: {
        total: result.total,
        valid: result.valid,
        errors: result.errors,
      },
    });
  } catch (err) {
    console.error('[ERROR]', err.message);
    res.status(400).json({ ok: false, project: req.params.name, error: err.message });
  } finally {
    if (req.file) {
      fs.rm(req.file.path, { force: true }).catch(() => {});
    }
  }
});

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