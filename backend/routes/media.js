import { Router } from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { config } from '../config.js';
import { safeJoin } from '../fs-utils.js';

const router = Router();

router.get('/media/:name/*path', (req, res) => {
  const projectName = req.params.name;
  const restSegments = req.params.path || [];

  try {
    const rest = Array.isArray(restSegments) ? restSegments.join('/') : String(restSegments);
    const filePath = safeJoin(config.dirs.projects, projectName, rest);
    if (!existsSync(filePath)) {
      return res.status(404).json({ ok: false, error: 'Arquivo não encontrado.' });
    }

    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.mp4') {
      res.setHeader('Content-Type', 'video/mp4');
    } else if (ext === '.png') {
      res.setHeader('Content-Type', 'image/png');
    } else if (ext === '.jpg' || ext === '.jpeg') {
      res.setHeader('Content-Type', 'image/jpeg');
    }

    res.sendFile(filePath);
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

export default router;