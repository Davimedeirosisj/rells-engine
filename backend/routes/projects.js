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
    if (!existsSync(path.join(projectDir, 'manifest.json'))) throw new Error(`Projeto "${sanitized}" não encontrado.`);
    const srtPath = path.join(projectDir, 'original.srt');
    if (!existsSync(srtPath)) throw new Error('original.srt não encontrado para este projeto.');
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
