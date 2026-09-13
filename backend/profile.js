import fs from 'node:fs';
import { escapeFilterText } from './filter.js';

export const PROFILE_Y_RATIO = 0.78;
export const AVATAR_SIZE = 140;
export const BADGE_SIZE = 40;
export const HANDLE_FONT_SIZE = 44;
export const ARROBA_SIZE = 44;
export const ARROBA_GAP = 10;

function ffPath(p) {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

function has(path) {
  return Boolean(path) && fs.existsSync(path);
}

export function buildProfileInputs({ avatarPath, arrobaPath, verificationPath }) {
  const inputs = [];
  if (has(avatarPath)) inputs.push(avatarPath);
  if (has(arrobaPath)) inputs.push(arrobaPath);
  if (has(verificationPath)) inputs.push(verificationPath);
  return inputs;
}

export function buildProfileFilter({ handle, fontPath, avatarPath, arrobaPath, verificationPath, inputLabel = 'base' }) {
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

  const cleanHandle = String(handle || '').trim().replaceAll('@', '').toUpperCase();
  const textEstimate = cleanHandle ? Math.round(cleanHandle.length * HANDLE_FONT_SIZE * 0.6) : 0;

  if (cleanHandle) {
    const escPath = ffPath(fontPath);
    parts.push(
      `[${lastLabel}]drawtext=fontfile='${escPath}':text='${escapeFilterText(cleanHandle)}':` +
        `fontsize=${HANDLE_FONT_SIZE}:fontcolor=white:x=(w-text_w)/2:y=${handleY}[withhandle]`,
    );
    lastLabel = 'withhandle';
  }

  if (has(arrobaPath)) {
    const arrobaX = Math.round(1920 / 2 - textEstimate / 2 - ARROBA_SIZE - ARROBA_GAP);
    const arrobaY = handleY + Math.round((HANDLE_FONT_SIZE - ARROBA_SIZE) / 2);
    parts.push(`[${nextInputIndex}:v]scale=${ARROBA_SIZE}:${ARROBA_SIZE}[arroba]`);
    parts.push(`[${lastLabel}][arroba]overlay=${arrobaX}:${arrobaY}[witharroba]`);
    lastLabel = 'witharroba';
    nextInputIndex += 1;
  }

  if (has(verificationPath)) {
    const badgeX = Math.round(1920 / 2 + textEstimate / 2 + 12 - BADGE_SIZE / 2);
    const badgeY = handleY + Math.round(HANDLE_FONT_SIZE / 2) - Math.round(BADGE_SIZE / 2);
    parts.push(`[${nextInputIndex}:v]scale=${BADGE_SIZE}:${BADGE_SIZE}[badge]`);
    parts.push(`[${lastLabel}][badge]overlay=${badgeX}:${badgeY}[v]`);
    lastLabel = 'v';
  }

  return { filter: parts.join(';'), lastLabel };
}
