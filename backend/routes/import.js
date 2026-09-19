import { Router } from 'express';
import multer from 'multer';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createProject, defaultProjectName } from '../project.js';
import { startTranscription } from '../transcription.js';
import { getTranscriptionStatus } from '../transcription.js';
import { config } from '../config.js';
import { startDownloadImport, getDownloadStatus, isDownloadRunning } from '../download.js';

const router = Router();

const upload = multer({
  dest: path.join(os.tmpdir(), 'rells-engine-uploads'),
  limits: { fileSize: 10 * 1024 * 1024 * 1024 },
});

router.post('/import', upload.fields([{ name: 'video', maxCount: 1 }]), async (req, res) => {
  const videoFile = req.files?.video?.[0];

  try {
    if (!videoFile) return res.status(400).json({ ok: false, error: 'Arquivo de vídeo não enviado.' });

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

router.post('/import/youtube', async (req, res) => {
  console.log('[DEBUG] Rota /import/youtube chamada');
  try {
    const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    
    console.log('[DEBUG] URL:', url);
    console.log('[DEBUG] Name:', name);

    const job = await startDownloadImport({ url, name });
    return res.status(202).json({ ok: true, ...job });
  } catch (err) {
    console.error('[ERROR] Importação via YouTube:', err.message);
    console.error('[ERROR] Stack:', err.stack);
    const status = /já existe|link inválido|inválido|indisponível|não encontrado/i.test(err.message) ? 400 : 500;
    return res.status(status).json({ ok: false, error: err.message });
  }
});

router.get('/import/youtube/:name/status', async (req, res) => {
  try {
    const name = req.params.name;
    const progress = getDownloadStatus(name);
    const running = isDownloadRunning(name);

    const projectDir = path.join(config.dirs.projects, name);
    const projectExists = existsSync(path.join(projectDir, 'manifest.json'));

    let transcription = null;
    if (projectExists) {
      transcription = await getTranscriptionStatus(name).catch(() => null);
    }

    return res.json({ ok: true, project: name, running, projectExists, progress, transcription });
  } catch (err) {
    console.error('[ERROR] Status do download:', err.message);
    return res.status(400).json({ ok: false, project: req.params.name, error: err.message });
  }
});

export default router;
