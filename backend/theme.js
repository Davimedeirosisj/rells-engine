import fs from 'node:fs';
import { escapeFilterText } from './filter.js';

export const THEME_MAX_LINE_CHARS = 24;
export const THEME_FONT_SIZE = 72;

export function wrapThemeText(text, maxChars = THEME_MAX_LINE_CHARS) {
  const upper = String(text).toUpperCase().trim();
  const words = upper.split(/\s+/).filter(Boolean);

  const lines = [];
  let current = '';

  for (const word of words) {
    if (word.length > maxChars) {
      if (current) {
        lines.push(current.trim());
        current = '';
      }
      lines.push(word);
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars) {
      lines.push(current.trim());
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current.trim()) {
    lines.push(current.trim());
  }

  return lines.length ? lines : [''];
}

export function buildThemeFilter(theme, fontPath) {
  if (!fs.existsSync(fontPath)) {
    throw new Error(`Fonte não encontrada: ${fontPath}`);
  }

  const lines = wrapThemeText(theme);
  if (lines.length === 0) {
    return null;
  }

  const escapedPath = fontPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");

  const baseY = Math.round(0.55 * 1920);
  const lineHeight = THEME_FONT_SIZE + 24;
  const startY = baseY - Math.round(((lines.length - 1) * lineHeight) / 2);

  const drawTexts = lines.map((line, i) => {
    const y = startY + i * lineHeight;
    return (
      `drawtext=fontfile='${escapedPath}':` +
      `text='${escapeFilterText(line)}':` +
      `fontsize=${THEME_FONT_SIZE}:` +
      `fontcolor=white:` +
      `x=(w-text_w)/2:y=${y}:` +
      `shadowcolor=black@0:box=0:line_spacing=0`
    );
  });

  return {
    lines,
    filter: drawTexts.join(','),
    y: baseY,
  };
}
