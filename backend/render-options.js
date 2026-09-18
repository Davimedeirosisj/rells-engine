import path from 'node:path';
import { existsSync } from 'node:fs';
import { config } from './config.js';
import { getGlobalSettings } from './settings.js';

// Resolve as opções de renderização de um corte com a precedência:
// corte (cut.options) > projeto (manifest.settings) > global (global-settings.json) > padrão.
export function resolveRenderOptions(cut = {}, { projectSettings = {}, projectDir } = {}) {
  const global = getGlobalSettings();
  const cutOptions = cut.options || {};

  const titleMode = cutOptions.titleMode
    ?? projectSettings.titleMode
    ?? global.titleMode
    ?? 'overlay';

  const showArroba = (cutOptions.showArroba
    ?? projectSettings.showArroba
    ?? global.showArroba
    ?? true) !== false;

  let handleImagePath = null;
  if (showArroba) {
    const projectArroba = projectDir ? path.join(projectDir, 'assets', 'arroba.png') : null;
    if (projectArroba && existsSync(projectArroba)) {
      handleImagePath = projectArroba;
    } else if (global.arroba && existsSync(global.arroba)) {
      handleImagePath = global.arroba;
    } else if (config.arrobaPath && existsSync(config.arrobaPath)) {
      handleImagePath = config.arrobaPath;
    }
  }

  return { titleMode, showArroba, handleImagePath };
}