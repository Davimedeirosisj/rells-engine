import { timestampToMs } from './timestamp.js';

const CUT_REQUIRED_FIELDS = ['id', 'start', 'end', 'title', 'theme', 'cover_hook'];

export function parseCortes(raw) {
  let cortes;
  try {
    cortes = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    throw new Error('cortes.json não é um JSON válido.');
  }

  if (!cortes || typeof cortes !== 'object') {
    throw new Error('cortes.json deve ser um objeto JSON.');
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

  if (startMs <= 0 || endMs <= 0) {
    return { 
      ok: false, 
      error: `${label} possui timestamps negativos ou zero.` 
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