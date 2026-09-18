import { Router } from 'express';
import multer from 'multer';
import os from 'node:os';
import { listProjects, getProject, saveManifest } from '../projects.js';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { sanitizeFilename, safeJoin, validateExtension, isPngBuffer } from '../fs-utils.js';
import { isValidTitleMode } from '../settings.js';

const router = Router();

const uploadArroba = multer({
  dest: path.join(os.tmpdir(), 'rells-engine-uploads-arroba'),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.get('/projects', async (_req, res) => {
  try { res.json({ ok: true, projects: await listProjects() }); }
  catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

router.get('/projects/:name', async (req, res) => {
  try {
    const project = await getProject(req.params.name);
    const hasCustomArroba = existsSync(path.join(project.dir, 'assets', 'arroba.png'));
    res.json({
      ok: true,
      project: {
        ...project,
        hasCustomArroba,
        customArrobaUrl: hasCustomArroba
          ? `/media/${encodeURIComponent(project.name)}/assets/arroba.png?v=${Date.now()}`
          : null,
      },
    });
  } catch (err) { res.status(404).json({ ok: false, error: err.message }); }
});

router.put('/projects/:name/settings', async (req, res) => {
  try {
    const project = await getProject(req.params.name);
    const { titleMode, showArroba } = req.body || {};
    const next = { ...(project.manifest.settings || {}) };

    if (titleMode !== undefined) {
      if (!isValidTitleMode(titleMode)) {
        return res.status(400).json({ ok: false, error: 'titleMode inválido (overlay | filename | hidden).' });
      }
      next.titleMode = titleMode;
    }
    if (showArroba !== undefined) next.showArroba = showArroba !== false;

    project.manifest.settings = next;
    await saveManifest(req.params.name, project.manifest);
    res.json({ ok: true, settings: next });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/projects/:name/arroba', uploadArroba.single('image'), async (req, res) => {
  try {
    const project = await getProject(req.params.name);
    if (!req.file) throw new Error('Imagem não enviada.');
    validateExtension(req.file.originalname, 'png');

    const buf = await fs.readFile(req.file.path);
    if (!isPngBuffer(buf)) throw new Error('Arquivo não é um PNG válido.');

    const destDir = path.join(project.dir, 'assets');
    await fs.mkdir(destDir, { recursive: true });
    await fs.writeFile(path.join(destDir, 'arroba.png'), buf);

    res.json({ ok: true, url: `/media/${encodeURIComponent(project.name)}/assets/arroba.png?v=${Date.now()}` });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  } finally {
    if (req.file) await fs.rm(req.file.path, { force: true }).catch(() => {});
  }
});

router.delete('/projects/:name/arroba', async (req, res) => {
  try {
    const project = await getProject(req.params.name);
    await fs.rm(path.join(project.dir, 'assets', 'arroba.png'), { force: true }).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.get('/projects/:name/srt', async (req, res) => {
  try {
    const sanitized = sanitizeFilename(req.params.name);
    const projectDir = safeJoin(config.dirs.projects, sanitized);
    const manifestPath = path.join(projectDir, 'manifest.json');
    if (!existsSync(manifestPath)) throw new Error(`Projeto "${sanitized}" não encontrado.`);

    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    const srtPath = manifest.transcription?.srtPath;
    if (!srtPath || !path.isAbsolute(srtPath)) throw new Error('SRT da transcrição não está disponível.');
    if (!existsSync(srtPath)) throw new Error('SRT temporário não encontrado. Gere a transcrição novamente.');

    const content = await fs.readFile(srtPath, 'utf8');
    res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="original.srt"');
    res.send(content);
  } catch (err) {
    console.error('[ERROR] SRT route error:', err.message);
    res.status(404).json({ ok: false, error: err.message });
  }
});

export default router;
