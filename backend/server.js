import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { checkFfmpeg, checkFfprobe, checkFont } from './system.js';
import importRouter from './routes/import.js';
import projectsRouter from './routes/projects.js';
import transcriptionRouter from './routes/transcription.js';
import cutsRouter from './routes/cuts.js';
import previewRouter from './routes/preview.js';
import batchRouter from './routes/batch.js';
import exportRouter from './routes/export.js';
import mediaRouter from './routes/media.js';

export function createApp() {
  const app = express();
  app.use(express.json());
  app.get('/', async (_req, res, next) => {
    try {
      const indexPath = path.join(config.dirs.app, 'index.html');
      let html = await fs.readFile(indexPath, 'utf8');
      html = html.replace('</body>', '  <script src="/srt-save.js?v=2"></script>\n  <script src="/progress-ui.js?v=3"></script>\n  <script src="/ux3-unified-cuts.js?v=1"></script>\n</body>');
      res.type('html').send(html);
    } catch (err) {
      next(err);
    }
  });
  app.use(express.static(path.join(config.dirs.app)));

  app.get('/api/health', async (_req, res) => {
    const [ffmpeg, ffprobe] = await Promise.all([checkFfmpeg(), checkFfprobe()]);
    const font = checkFont();
    res.json({ status: 'ok', app: 'rells-engine', version: '0.1.0', host: config.host, ffmpeg, ffprobe, font });
  });

  app.use('/api', importRouter);
  app.use('/api', projectsRouter);
  app.use('/api', transcriptionRouter);
  app.use('/api', cutsRouter);
  app.use('/api', previewRouter);
  app.use('/api', batchRouter);
  app.use('/api', exportRouter);
  app.use('/', mediaRouter);

  app.use((err, _req, res, _next) => {
    console.error('[ERROR]', err);
    if (res.headersSent) return;
    res.status(500).json({ error: 'Erro interno' });
  });

  return app;
}

export function startServer() {
  const app = createApp();
  app.listen(config.port, config.host, () => {
    console.log(`[INFO] Servidor iniciado em http://${config.host}:${config.port}`);
  });
  return app;
}

const isEntryPoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntryPoint) startServer();