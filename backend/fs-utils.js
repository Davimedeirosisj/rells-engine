import path from 'node:path';

const WINDOWS_INVALID_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;
const PROJECT_TRAVERSAL = /(^|[\\/])\.\.?([\\/]|$)/;
const PROJECT_FORBIDDEN = /[<>:"|?*\u0000-\u001f]/g;

export function sanitizeFilename(name = '') {
  const cleaned = String(name)
    .replace(WINDOWS_INVALID_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'sem-nome';
}

export function sanitizeProjectName(name = '', { fallback = '' } = {}) {
  const value = String(name);
  if (
    value === '' ||
    PROJECT_TRAVERSAL.test(value) ||
    /^[\\/]/.test(value) ||
    /^[a-zA-Z]:[\\/]/.test(value)
  ) {
    return fallback;
  }
  const cleaned = value
    .replace(/[\\/]+/g, '-')
    .replace(PROJECT_FORBIDDEN, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || fallback;
}

export function safeJoin(baseDir, ...segments) {
  const target = path.resolve(baseDir, ...segments);
  const base = path.resolve(baseDir);
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new Error('Caminho inválido (path traversal bloqueado)');
  }
  return target;
}

const ALLOWED_EXTENSIONS = {
  video: ['.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v'],
  srt: ['.srt'],
  json: ['.json'],
};

export function validateExtension(filename, kind) {
  const ext = path.extname(String(filename)).toLowerCase();
  const allowed = ALLOWED_EXTENSIONS[kind] || [];
  if (!allowed.includes(ext)) {
    throw new Error(
      `Extensão inválida para ${kind}: "${ext || '(nenhuma)'}". Esperado: ${allowed.join(', ')}`,
    );
  }
  return ext;
}