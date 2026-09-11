import { buildThemeFilter } from './theme.js';
import { buildProfileFilter, buildProfileInputs } from './profile.js';
import fs from 'node:fs';

export const OUTPUT_WIDTH = 1080;
export const OUTPUT_HEIGHT = 1920;

export function escapeFilterText(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/,/g, '\\,');
}

export function buildVideoFilter({
  theme,
  fontPath,
  handle,
  avatarPath,
  verificationPath,
} = {}) {
  const w = OUTPUT_WIDTH;
  const h = OUTPUT_HEIGHT;

  const parts = [
    '[0:v]split=2[bg][fg]',
    `[bg]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},gblur=sigma=40[bgv]`,
    `[fg]scale=${w}:${h}:force_original_aspect_ratio=decrease[fgv]`,
    '[bgv][fgv]overlay=(W-w)/2:(H-h)/2[base]',
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
  const hasBadge = Boolean(verificationPath) && fs.existsSync(verificationPath);
  const hasHandle = Boolean(handle) && handle.trim();

  if (hasAvatar || hasBadge || hasHandle) {
    const profile = buildProfileFilter({
      handle,
      fontPath,
      avatarPath,
      verificationPath,
      inputLabel: lastLabel,
    });
    parts.push(profile.filter);
    lastLabel = profile.lastLabel;
  }

  if (lastLabel !== 'v') {
    parts.push(`[${lastLabel}]null[v]`);
  }

  const extraInputs = buildProfileInputs({ avatarPath, verificationPath });

  return {
    filter: parts.join(';'),
    extraInputs,
  };
}