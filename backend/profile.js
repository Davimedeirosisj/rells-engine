import fs from 'node:fs';

export const PROFILE_Y_RATIO = 0.78;
export const ARROBA_SIZE = 44;

function has(path) {
  return Boolean(path) && fs.existsSync(path);
}

export function buildProfileInputs({ arrobaPath }) {
  return has(arrobaPath) ? [arrobaPath] : [];
}

export function buildProfileFilter({ arrobaPath, inputLabel = 'base' }) {
  const parts = [];
  const centerY = Math.round(PROFILE_Y_RATIO * 1920);
  const x = Math.round((1080 - ARROBA_SIZE) / 2);
  const y = centerY;

  let lastLabel = inputLabel;

  // O perfil agora é exclusivamente o PNG da pasta "arroba".
  // Não renderizar nome, texto de arroba, avatar ou selo de verificação.
  if (has(arrobaPath)) {
    parts.push(`[1:v]scale=${ARROBA_SIZE}:${ARROBA_SIZE}[arroba]`);
    parts.push(`[${lastLabel}][arroba]overlay=${x}:${y}[v]`);
    lastLabel = 'v';
  }

  return { filter: parts.join(';'), lastLabel };
}
