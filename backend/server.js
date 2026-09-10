import express from 'express';
import path from 'node:path';
import { config } from './config.js';
import { checkFfmpeg, checkFfprobe, checkFont } from './system.js';
import importRouter from './routes/import.js';
import projectsRouter from './routes/projects.js';
import cutsRouter from './routes/cuts.js';

const app = express();
app.use(express.json());

app.use(express.static(path.join(config.dirs.app)));

app.get('/api/health', async (_req, res) => {
  const [ffmpeg, ffprobe] = await Promise.all([checkFfmpeg(), checkFfprobe()]);
  const font = checkFont();
  res.json({
    status: 'ok',
    app: 'rells-engine',
    version: '0.1.0',
    ffmpeg,
    ffprobe,
    font,
  });
});

app.use('/api', importRouter);
app.use('/api', projectsRouter);
app.use('/api', cutsRouter);

app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err);
  res.status(500).json({ error: 'Erro interno' });
});

app.listen(config.port, () => {
  console.log(`[INFO] Servidor iniciado em http://localhost:${config.port}`);
});