import { Router } from 'express';
import { listProjects, getProject } from '../projects.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { sanitizeFilename, safeJoin } from '../fs-utils.js';

const router = Router();

router.get('/projects', async (_req, res) => {
  try {
    const projects = await listProjects();
    res.json({ ok: true, projects });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/projects/:name', async (req, res) => {
  try {
    const project = await getProject(req.params.name);
    res.json({ ok: true, project });
  } catch (err) {
    res.status(404).json({ ok: false, error: err.message });
  }
});

router.get('/projects/:name/srt', async (req, res) => {
  try {
    // Sanitizar e resolver o caminho do projeto
    const sanitized = sanitizeFilename(req.params.name);
    
    let projectDir;
    try {
      projectDir = safeJoin(config.dirs.projects, sanitized);
    } catch (err) {
      throw new Error('Projeto inválido');
    }

    const manifestPath = path.join(projectDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Projeto "${sanitized}" não encontrado.`);
    }

    // Ler o SRT do arquivo original.srt
    const srtPath = path.join(projectDir, 'original.srt');
    if (!fs.existsSync(srtPath)) {
      throw new Error('original.srt não encontrado para este projeto.');
    }

    // Ler o conteúdo EXATO do arquivo
    let content;
    try {
      content = await fs.readFile(srtPath, 'utf8');
    } catch (err) {
      throw new Error(`Falha ao ler original.srt: ${err.message}`);
    }

    res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="original.srt"');
    res.send(content);
  } catch (err) {
    console.error('[ERROR] SRT route error:', err.message);
    res.status(404).json({ ok: false, error: err.message });
  }
});

export default router;