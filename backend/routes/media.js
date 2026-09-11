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
  
  // Sanitization
  const sanitizedPath = safeJoin('', ...restSegments);
  if (!sanitizedPath || sanitizedPath.startsWith('..')) {
    return res.status(400).json({ ok: false, error: 'Caminho inválido.' });
  }

  try {
    const rest = sanitizedPath;
    const filePath = safeJoin(config.dirs.projects, projectName, rest);
    
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
      '.jpeg': 'image/jpeg'
    };
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');

    res.sendFile(filePath);
  } catch (err) {
    console.error('[ERROR]', err.message);
    res.status(400).json({ ok: false, error: 'Erro ao servir arquivo.' });
  }
});

export default router;