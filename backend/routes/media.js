import { Router } from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { config } from '../config.js';
import { safeJoin } from '../fs-utils.js';

const router = Router();

router.get('/media/:name/*path', (req, res) => {
  const projectName = req.params.name;
  const restSegments = Array.isArray(req.params.path)
    ? req.params.path
    : [req.params.path];
  const cleanedSegments = restSegments.filter((s) => s && s !== '');

  try {
    // Atravessar para fora do nome do projeto -> 404 (não vaza arquivo)
    if (String(projectName).includes('..')) {
      return res.status(404).json({ ok: false, error: 'Arquivo não encontrado.' });
    }

    // Path traversal dentro do caminho do arquivo -> 400 (bloqueado pelo safeJoin)
    if (cleanedSegments.some((s) => String(s).includes('..'))) {
      return res.status(400).json({ ok: false, error: 'Caminho inválido.' });
    }

    const filePath = safeJoin(config.dirs.projects, projectName, ...cleanedSegments);
    const base = path.resolve(config.dirs.projects);
    if (!filePath.startsWith(base + path.sep)) {
      return res.status(400).json({ ok: false, error: 'Caminho inválido.' });
    }

    if (!existsSync(filePath)) {
      return res.status(404).json({ ok: false, error: 'Arquivo não encontrado.' });
    }

    const ext = path.extname(filePath).toLowerCase();
    const allowedExts = ['.mp4', '.png', '.jpg', '.jpeg'];
    if (!allowedExts.includes(ext)) {
      return res.status(400).json({ ok: false, error: 'Tipo de arquivo não permitido.' });
    }

    const mimeTypes = {
      '.mp4': 'video/mp4',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
    };
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');

    res.sendFile(filePath);
  } catch (err) {
    console.error('[ERROR]', err.message);
    res.status(400).json({ ok: false, error: 'Erro ao servir arquivo.' });
  }
});

export default router;