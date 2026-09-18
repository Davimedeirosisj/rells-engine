import fs from 'node:fs';
import { config } from './config.js';

const DEFAULT_SETTINGS = {
  titleMode: 'overlay', // overlay | filename | hidden
  showArroba: true,
  arroba: '', // caminho absoluto de um PNG global customizado (vazio = usa a pasta arroba/)
};

export function getGlobalSettings() {
  try {
    if (!fs.existsSync(config.globalSettingsPath)) return { ...DEFAULT_SETTINGS };
    const raw = JSON.parse(fs.readFileSync(config.globalSettingsPath, 'utf8'));
    return { ...DEFAULT_SETTINGS, ...raw };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveGlobalSettings(patch = {}) {
  const next = { ...getGlobalSettings(), ...patch };
  fs.writeFileSync(config.globalSettingsPath, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

export function isValidTitleMode(mode) {
  return mode === 'overlay' || mode === 'filename' || mode === 'hidden';
}