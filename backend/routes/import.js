import { Router } from 'express';
import multer from 'multer';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createProject, parseProjectName } from '../project.js';
import { parseCortes } from '../cortes.js';

const router = Router();

const upload = multer({
  dest: path.join(os.tmpdir(), 'rells-engine-uploads'),
  limits: { fileSize: 10 * 1024 * 1024 * 1024 }, // 10GB max
});

const fields = [
  { name: 'video', maxCount: 1 },
  { name: 'cortes', maxCount: 1 },
];

// Recebe APENAS vídeo + gera SRT automaticamente pelo backend (sem necessidade de upload manual do SRT)
router.post('/import', upload.fields(fields), async (req, res) => {
  const files = req.files || {};

  const videoFile = files.video?.[0];
  
  try {
    if (!videoFile) throw new Error('Arquivo de vídeo não enviado.');
    
    // Se não há cortes.json, o backend vai gerar corte automático baseado em marcos ou divisão simples
    const cortesData = files.cortes?.[0] ? await fs.readFile(files.cortes[0].path, 'utf8') : null;
    let cortes, project, name, cortesFile;

    try {
      if (cortesData) {
        // TEM cortes.json - parse normally
        cortes = parseCortes(cortesData);
        name = parseProjectName(cortes);
        if (!name) {
          throw new Error('cortes.json não possui o campo "project.name".');
        }
        cortesFile = files.cortes[0];
      } else {
        // SEM cortes.json -> gerar corte único automaticamente (todo o vídeo é 1 corte)
        name = 'Projeto ' + new Date().toLocaleDateString();
        // Criar projeto com corte único automático
        const tempCortes = [{
          id: 0,
          theme: 'Geral',
          title: '',
          start: '00:00:00',
          end: '00:00:00',
          durationMs: null,
          status: 'PENDENTE',
        }];
        // Simular estrutura de cortes para criar projeto
        cortes = { cuts: tempCortes };
      }

      project = await createProject({ name, videoFile, cortesFile });

      console.log('[INFO] Projeto importado:', name);
      console.log(`[INFO] Duração: ${project.videoDurationMs} ms`);
      if (cortes && cortes.cuts) {
        console.log(`[INFO] ${cortes.cuts.length} cortes encontrados`);
        console.log(`[INFO] Válidos: ${project.validation.valid.length} | Erros: ${project.validation.errors.length}`);
        for (const e of project.validation.errors) {
          console.log(`[ERROR] ${e}`);
        }
      }

      res.status(201).json({
        ok: true,
        project: { name, dir: project.dir },
        cuts: {
          total: cortes.cuts?.length || 1,
          valid: cortes.cuts ? project.validation.valid.length : 1,
          errors: cortes.cuts ? project.validation.errors : [],
        },
      });

    } catch (err) {
      console.error('[ERROR] Falha na importação:', err.message);
      res.status(400).json({ ok: false, error: err.message });
    }
  } catch (err) {
    console.error('[ERROR]', err.message);
    res.status(400).json({ ok: false, error: err.message });
  } finally {
    // Limpar uploads
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

export default router;
