import { Router } from 'express';
import multer from 'multer';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { config } from '../config.js';
import { getGlobalSettings, saveGlobalSettings, isValidTitleMode } from '../settings.js';
import { validateExtension, isPngBuffer } from '../fs-utils.js';

const router = Router();

const upload = multer({
  dest: path.join(os.tmpdir(), 'rells-engine-uploads-settings'),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const GLOBAL_ARROBA = path.join(config.dirs.data, 'global-arroba.png');

router.get('/settings', (_req, res) => {
  const s = getGlobalSettings();
  const hasGlobalArroba = existsSync(GLOBAL_ARROBA);
  res.json({
    ok: true,
    settings: {
      ...s,
      hasGlobalArroba,
      globalArrobaUrl: hasGlobalArroba ? `/api/settings/arroba?v=${Date.now()}` : null,
    },
  });
});

router.put('/settings', (req, res) => {
  const { titleMode, showArroba } = req.body || {};
  const patch = {};

  if (titleMode !== undefined) {
    if (!isValidTitleMode(titleMode)) {
      return res.status(400).json({ ok: false, error: 'titleMode inválido (overlay | filename | hidden).' });
    }
    patch.titleMode = titleMode;
  }
  if (showArroba !== undefined) patch.showArroba = showArroba !== false;

  const next = saveGlobalSettings(patch);
  res.json({ ok: true, settings: next });
});

router.post('/settings/arroba', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) throw new Error('Imagem não enviada.');
    validateExtension(req.file.originalname, 'png');

    const buf = await fs.readFile(req.file.path);
    if (!isPngBuffer(buf)) throw new Error('Arquivo não é um PNG válido.');

    await fs.mkdir(config.dirs.data, { recursive: true });
    await fs.writeFile(GLOBAL_ARROBA, buf);
    saveGlobalSettings({ arroba: GLOBAL_ARROBA });

    res.json({ ok: true, url: `/api/settings/arroba?v=${Date.now()}` });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  } finally {
    if (req.file) await fs.rm(req.file.path, { force: true }).catch(() => {});
  }
});

router.delete('/settings/arroba', async (_req, res) => {
  await fs.rm(GLOBAL_ARROBA, { force: true }).catch(() => {});
  const next = saveGlobalSettings({ arroba: '' });
  res.json({ ok: true, settings: next });
});

router.get('/settings/arroba', (req, res) => {
  if (!existsSync(GLOBAL_ARROBA)) {
    return res.status(404).json({ ok: false, error: 'Nenhum PNG global definido.' });
  }
  res.type('png').sendFile(GLOBAL_ARROBA);
});

export default router;