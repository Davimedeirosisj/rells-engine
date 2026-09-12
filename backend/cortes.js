import fs from 'node:fs';
import { existsSync } from 'node:fs';
import { timestampToMs, msToTimestamp } from './timestamp.js';
import { parseSrt } from './srt.js';

const CUT_REQUIRED_FIELDS = ['id', 'start', 'end', 'title', 'theme', 'cover_hook'];

export function parseCortes(raw, { projectName = null } = {}) {
  let cortes;
  try {
    cortes = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    throw new Error('cortes.json não é um JSON válido.');
  }

  if (!cortes || typeof cortes !== 'object') {
    throw new Error('cortes.json deve ser um objeto JSON.');
  }

  // In the HTTP import flow the project is already identified by
  // /projects/:name. Keep project metadata optional in the uploaded JSON
  // and bind it to the route parameter instead of requiring duplication.
  if ((!cortes.project || typeof cortes.project !== 'object') && projectName) {
    cortes = { ...cortes, project: { name: projectName } };
  }

  if (!cortes.project || typeof cortes.project !== 'object') {
    throw new Error('Campo "project" ausente ou inválido.');
  }

  if (!Array.isArray(cortes.cuts)) {
    throw new Error('Campo "cuts" ausente ou não é uma lista.');
  }

  return cortes;
}

export function validateCut(cut, index, videoDurationMs) {
  const label = `Corte ${String(index + 1).padStart(2, '0')}`;

  if (!cut || typeof cut !== 'object') {
    return { ok: false, error: `${label} não é um objeto válido.` };
  }

  for (const field of CUT_REQUIRED_FIELDS) {
    if (cut[field] === undefined || cut[field] === null || cut[field] === '') {
      return { ok: false, error: `${label} possui campo obrigatório ausente: "${field}".` };
    }
  }

  if (!Number.isInteger(cut.id)) {
    return { ok: false, error: `${label} possui "id" inválido (deve ser inteiro).` };
  }

  let startMs;
  let endMs;
  try {
    startMs = timestampToMs(cut.start);
  } catch {
    return { ok: false, error: `${label} possui timestamp de início inválido: "${cut.start}".` };
  }
  try {
    endMs = timestampToMs(cut.end);
  } catch {
    return { ok: false, error: `${label} possui timestamp de fim inválido: "${cut.end}".` };
  }

  // Validate finitude and positivity
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return { 
      ok: false, 
      error: `${label} possui timestamps inválidos (não são números finitos).` 
    };
  }

  if (startMs < 0 || endMs < 0) {
    return { 
      ok: false, 
      error: `${label} possui timestamps negativos.` 
    };
  }

  if (startMs >= endMs) {
    return { ok: false, error: `${label} possui início (${cut.start}) maior ou igual ao fim (${cut.end}).` };
  }

  if (videoDurationMs !== undefined && endMs > videoDurationMs) {
    return {
      ok: false,
      error: `${label} possui fim (${cut.end}) além da duração do vídeo.`,
    };
  }

  return {
    ok: true,
    cut: {
      id: cut.id,
      start: cut.start,
      end: cut.end,
      startMs,
      endMs,
      cover_hook: cut.cover_hook,
      title: cut.title,
      theme: cut.theme,
      speech: cut.speech || '',
      potential: cut.potential || '',
      raw: cut,
    },
  };
}

export function validateCuts(cortes, videoDurationMs) {
  const results = cortes.cuts.map((cut, index) => validateCut(cut, index, videoDurationMs));

  const errors = results.filter((r) => !r.ok).map((r) => r.error);
  const valid = results.filter((r) => r.ok).map((r) => r.cut);

  return { valid, errors, results };
}

export function validateCutsAgainstSrt(validCuts, srtPath) {
  const errors = [];
  const kept = [];

  if (!existsSync(srtPath)) return { errors, cuts: validCuts.map((c) => ({ ...c })) };

  const blocks = parseSrt(fs.readFileSync(srtPath, 'utf8'));
  if (blocks.length === 0) return { errors, cuts: validCuts.map((c) => ({ ...c })) };

  const spanStart = blocks[0].startMs;
  const spanEnd = blocks[blocks.length - 1].endMs;

  for (const cut of validCuts) {
    const c = { ...cut };
    const label = `Corte ${c.id}`;
    let fatal = false;

    if (c.startMs < spanStart || c.endMs > spanEnd) {
      fatal = true;
      errors.push(
        `${label} (${c.start} → ${c.end}) está fora do intervalo do SRT ` +
          `(${msToTimestamp(spanStart)} → ${msToTimestamp(spanEnd)}).`,
      );
    }

    const raw = c.raw || {};

    if (raw.srt_block !== undefined && raw.srt_block !== null) {
      if (typeof raw.srt_block !== 'string' || raw.srt_block.trim() === '') {
        fatal = true;
        errors.push(`${label} possui "srt_block" inválido (deve ser um texto não vazio).`);
      } else {
        const block = blocks.find(
          (b) => b.text.includes(raw.srt_block) || raw.srt_block.includes(b.text),
        );
        if (!block) {
          fatal = true;
          errors.push(`${label} possui "srt_block" que não corresponde ao original.srt.`);
        } else {
          c.srt_block = raw.srt_block;
        }
      }
    }

    if (raw.speech_timestamps !== undefined && raw.speech_timestamps !== null) {
      const timestamps = raw.speech_timestamps;
      if (!Array.isArray(timestamps) || timestamps.length === 0) {
        errors.push(`${label} possui "speech_timestamps" inválido (deve ser uma lista não vazia).`);
      } else {
        const valid = [];
        for (const t of timestamps) {
          let ms;
          try {
            ms = timestampToMs(t);
          } catch {
            errors.push(`${label} possui "speech_timestamps" inválido: "${t}".`);
            continue;
          }
          if (ms < c.startMs || ms > c.endMs) {
            errors.push(`${label} possui "speech_timestamps" "${t}" fora do intervalo do corte.`);
            continue;
          }
          valid.push(t);
        }
        if (valid.length) c.speech_timestamps = valid;
      }
    }

    if (!fatal) kept.push(c);
  }

  return { errors, cuts: kept };
}