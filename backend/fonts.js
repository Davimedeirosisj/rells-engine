import { existsSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const WINDOWS_FONT_CANDIDATES = [
  'Gobold-Bold.ttf',
  'Gobold Bold.ttf',
  'GOBOLD.ttf',
  'Arial.ttf',
  'arialbd.ttf',
];

export function resolveFontPath() {
  if (config.fontPath && existsSync(config.fontPath)) return config.fontPath;

  if (process.platform === 'win32') {
    for (const filename of WINDOWS_FONT_CANDIDATES) {
      const candidate = path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', filename);
      if (existsSync(candidate)) return candidate;
    }
  }

  return null;
}

export function assertFontAvailable() {
  const fontPath = resolveFontPath();
  if (!fontPath) {
    throw new Error(
      `Nenhuma fonte compatível encontrada. Coloque Gobold-Bold.ttf em ${config.dirs.fonts} ou configure FONT_PATH.`,
    );
  }
  return fontPath;
}
