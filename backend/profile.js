import fs from 'node:fs';
import { escapeFilterText } from './filter.js';

export const PROFILE_Y_RATIO = 0.78;
export const AVATAR_SIZE = 140;
export const BADGE_SIZE = 40;
export const HANDLE_FONT_SIZE = 44;

function ffPath(p) {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

function has(path) {
  return Boolean(path) && fs.existsSync(path);
}

export function buildProfileInputs({ avatarPath, verificationPath }) {
  const inputs = [];
  if (has(avatarPath)) inputs.push(avatarPath);
  if (has(verificationPath)) inputs.push(verificationPath);
  return inputs;
}

export function buildProfileFilter({ handle, fontPath, avatarPath, verificationPath, inputLabel = 'base' }) {
  const parts = [];
  const centerY = Math.round(PROFILE_Y_RATIO * 1920);

  const avatarTopY = centerY - AVATAR_SIZE - 40;
  const handleY = centerY + 30;

  let lastLabel = inputLabel;
  let nextInputIndex = 1;

  if (has(avatarPath)) {
    parts.push(`[${nextInputIndex}:v]scale=${AVATAR_SIZE}:${AVATAR_SIZE}[avatar]`);
    parts.push(`[${lastLabel}][avatar]overlay=(W-w)/2:${avatarTopY}[withavatar]`);
    lastLabel = 'withavatar';
    nextInputIndex += 1;
  }

  if (handle && handle.trim()) {
    const escPath = ffPath(fontPath);
    const text = escapeFilterText(handle).toLowerCase();
    parts.push(
      `[${lastLabel}]drawtext=fontfile='${escPath}':text='${text}':` +
        `fontsize=${HANDLE_FONT_SIZE}:fontcolor=white:x=(w-text_w)/2:y=${handleY}[withhandle]`,
    );
    lastLabel = 'withhandle';
  }

  if (has(verificationPath)) {
    const handleEstimate = handle ? Math.round(handle.length * HANDLE_FONT_SIZE * 0.6) : 0;
    const badgeX = Math.round(1920 / 2 + handleEstimate / 2 + 12 - BADGE_SIZE / 2);
    const badgeY = handleY + Math.round(HANDLE_FONT_SIZE / 2) - Math.round(BADGE_SIZE / 2);

    parts.push(`[${nextInputIndex}:v]scale=${BADGE_SIZE}:${BADGE_SIZE}[badge]`);
    parts.push(`[${lastLabel}][badge]overlay=${badgeX}:${badgeY}[v]`);
    lastLabel = 'v';
  }

  return {
    filter: parts.join(';'),
    lastLabel,
  };
}