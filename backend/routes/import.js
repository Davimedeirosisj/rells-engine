import { Router } from 'express';
import multer from 'multer';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createProject, parseProjectName, defaultProjectName } from '../project.js';
import { parseCortes } from '../cortes.js';
import { config } from '../config.js';
import { startTranscription, getTranscriptionStatus } from '../transcription.js';

const router = Router();

const upload = multer({
  dest: path.join(os.tmpdir(), 'rells-engine-uploads'),
  limits: { fileSize: 10 * 1024 * 1024 * 1024 }, // 10GB max
});

// Fluxo oficial em 2 etapas:
//   Etapa 1 -> apenas 'video' (SRT gerado pelo Whisper local)
//   Etapa 2 -> 'cortes' importado depois via POST /api/projects/:name/cuts/import
// 'srt' é aceito para compatibilidade com o fluxo antigo (envio único completo).
const fields = [
  { name: 'video', maxCount: 1 },
  { name: 'srt', maxCount: 1 },
  { name: 'cortes', maxCount: 1 },
];

router.post('/import', upload.fields(fields), async (req, res) => {
  const files = req.files || {};
  const videoFile = files.video?.[0];
  const srtFile = files.srt?.[0];
  const cortesFile = files.cortes?.[0];

  try {
    if (!videoFile) throw new Error('Arquivo de vídeo não enviado.');

    let cortes = null;
    let name;

    if (cortesFile) {
      const cortesData = await fs.readFile(cortesFile.path, 'utf8');
      cortes = parseCortes(cortesData);
      name = parseProjectName(cortes);
      if (!name) {
        throw new Error('cortes.json não possui o campo "project.name".');
      }
    } else {
      // Etapa 1 (fluxo oficial): apenas vídeo. NENHUM corte é criado automaticamente.
      name = defaultProjectName();
    }

    const project = await createProject({ name, videoFile, srtFile, cortesFile });

    console.log('[INFO] Projeto importado:', name);
    console.log(`[INFO] Duração: ${project.videoDurationMs} ms`);

    let cutsSummary = { total: 0, valid: 0, errors: [] };
    if (cortes && cortes.cuts) {
      console.log(`[INFO] ${cortes.cuts.length} cortes encontrados`);
      console.log(`[INFO] Válidos: ${project.validation.valid.length} | Erros: ${project.validation.errors.length}`);
      for (const e of project.validation.errors) {
        console.log(`[ERROR] ${e}`);
      }
      cutsSummary = {
        total: cortes.cuts.length,
        valid: project.validation.valid.length,
        errors: project.validation.errors,
      };
    } else {
      console.log('[INFO] Sem cortes — aguardando importação externa (Etapa 2).');
    }

    let transcription;
    if (srtFile) {
      // SRT enviado pelo usuário — pular Whisper, marcar pronto
      transcription = await getTranscriptionStatus(name);
    } else {
      // Etapa 1: disparar transcrição Whisper em background
      transcription = await startTranscription(name);
    }

    res.status(201).json({
      ok: true,
      project: { name, dir: project.dir },
      cuts: cutsSummary,
      transcription,
    });
  } catch (err) {
    console.error('[ERROR] Falha na importação:', err.message);
    res.status(400).json({ ok: false, error: err.message });
  } finally {
    // Limpar uploads temporários
    for (const list of Object.values(files)) {
      for (const f of list) {
        fs.rm(f.path, { force: true }).catch(() => {});
      }
    }

    // Clear local uploads if they exist
    const localUploads = path.join(config.dirs.temp, 'uploads');
    try {
      if (await fs.access(localUploads).then(() => true).catch(() => false)) {
        await fs.rm(localUploads, { recursive: true, force: true });
      }
    } catch {}
  }
});

// Consultar status da transcrição
router.get('/projects/:name/transcription', async (req, res) => {
  try {
    const transcription = await getTranscriptionStatus(req.params.name);
    res.json({ ok: true, transcription });
  } catch (err) {
    res.status(404).json({ ok: false, error: err.message });
  }
});

// Retentar transcrição (re-dispara Whisper)
router.post('/projects/:name/transcribe', async (req, res) => {
  try {
    const result = await startTranscription(req.params.name);
    const ok = result.status !== 'ERROR';
    res.status(ok ? 200 : 400).json({ ok, transcription: result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

export default router;
