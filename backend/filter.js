import { buildThemeFilter } from './theme.js';
import { buildProfileFilter, buildProfileInputs } from './profile.js';
import fs from 'node:fs';
import path from 'node:path';

export const OUTPUT_WIDTH = 1080;
export const OUTPUT_HEIGHT = 1920;

function findArrobaPng() {
  const dir = path.join(process.cwd(), 'arroba');
  if (!fs.existsSync(dir)) return '';
  const name = fs.readdirSync(dir).filter((item) => item.toLowerCase().endsWith('.png')).sort()[0];
  return name ? path.join(dir, name) : '';
}

export function escapeFilterText(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/,/g, '\\,');
}

export function buildVideoFilter(options = {}) {
  const {
    theme,
    fontPath,
    handle,
    avatarPath,
    handleImagePath,
    verificationPath,
  } = options;
  const w = OUTPUT_WIDTH;
  const h = OUTPUT_HEIGHT;
  const resolvedHandleImage = handleImagePath || findArrobaPng();

  const parts = [
    `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}:(iw-${w})/2:(ih-${h})/2[base]`,
  ];

  let lastLabel = 'base';

  if (theme && theme.trim()) {
    const themeFilter = buildThemeFilter(theme, fontPath);
    if (themeFilter) {
      parts.push(`[${lastLabel}]${themeFilter.filter}[v]`);
      lastLabel = 'v';
    }
  }

  const hasAvatar = Boolean(avatarPath) && fs.existsSync(avatarPath);
  const hasHandleImage = Boolean(resolvedHandleImage) && fs.existsSync(resolvedHandleImage);
  const hasBadge = Boolean(verificationPath) && fs.existsSync(verificationPath);
  const hasHandle = Boolean(handle) && handle.trim();

  if (hasAvatar || hasHandleImage || hasBadge || hasHandle) {
    const profile = buildProfileFilter({
      handle,
      fontPath,
      avatarPath,
      arrobaPath: resolvedHandleImage,
      verificationPath,
      inputLabel: lastLabel,
    });
    parts.push(profile.filter);
    lastLabel = profile.lastLabel;
  }

  if (lastLabel !== 'v') {
    parts.push(`[${lastLabel}]null[v]`);
  }

  const extraInputs = buildProfileInputs({
    avatarPath,
    arrobaPath: resolvedHandleImage,
    verificationPath,
  });

  return { filter: parts.join(';'), extraInputs };
}
