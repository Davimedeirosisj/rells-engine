import { Router } from 'express';
import { listProjects, getProject } from '../projects.js';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { sanitizeFilename, safeJoin } from '../fs-utils.js';

const router = Router();

router.get('/projects', async (_req, res) => {
  try { res.json({ ok: true, projects: await listProjects() }); }
  catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

router.get('/projects/:name', async (req, res) => {
  try { res.json({ ok: true, project: await getProject(req.params.name) }); }
  catch (err) { res.status(404).json({ ok: false, error: err.message }); }
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
