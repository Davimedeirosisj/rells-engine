import { Router } from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { getProject } from '../projects.js';
import { exportProjectZip } from '../export.js';
import { sanitizeFilename } from '../fs-utils.js';

const router = Router();

router.post('/projects/:name/export', async (req, res) => {
  try {
    const result = await exportProjectZip(req.params.name);
    res.json({
      ok: true,
      zipName: result.zipName,
      completed: result.completed,
      url: `/api/projects/${encodeURIComponent(req.params.name)}/download`,
    });
  } catch (err) {
    console.error('[ERROR]', err.message);
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.get('/projects/:name/download', async (req, res) => {
  try {
    const { dir, manifest } = await getProject(req.params.name);
    const zipName = `${sanitizeFilename(manifest.project || req.params.name)}-cortes.zip`;
    const zipPath = path.join(dir, 'temp', zipName);

    if (!existsSync(zipPath)) {
      return res.status(404).json({ ok: false, error: 'ZIP ainda não gerado. Exporte primeiro.' });
    }

    res.download(zipPath, zipName);
  } catch (err) {
    console.error('[ERROR]', err.message);
    res.status(400).json({ ok: false, error: err.message });
  }
});

export default router;