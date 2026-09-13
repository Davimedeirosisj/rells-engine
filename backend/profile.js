import fs from 'node:fs';

function has(path) {
  return Boolean(path) && fs.existsSync(path);
}

export function buildProfileInputs({ arrobaPath }) {
  return has(arrobaPath) ? [arrobaPath] : [];
}

export function buildProfileFilter({ arrobaPath, inputLabel = 'base' }) {
  const parts = [];

  let lastLabel = inputLabel;

  // O PNG já é uma arte 1080x1920 com o elemento na posição correta.
  // Portanto, não redimensionar, recortar ou reposicionar: apenas sobrepor
  // a arte inteira sobre o vídeo vertical.
  if (has(arrobaPath)) {
    parts.push(`[1:v]format=rgba[arroba]`);
    parts.push(`[${lastLabel}][arroba]overlay=0:0[v]`);
    lastLabel = 'v';
  }

  return { filter: parts.join(';'), lastLabel };
}
