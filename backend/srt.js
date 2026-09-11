import { timestampToMs } from './timestamp.js';

export function parseSrt(text) {
  const norm = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = norm.split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line || !/^\d+$/.test(line)) {
      i += 1;
      continue;
    }

    const timeLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
    const timeMatch = timeLine.match(
      /^(\d{1,2}:\d{1,2}:\d{1,2}[,.]\d{1,3})\s*-->\s*(\d{1,2}:\d{1,2}:\d{1,2}[,.]\d{1,3})/,
    );
    if (!timeMatch) {
      i += 1;
      continue;
    }

    let startMs;
    let endMs;
    try {
      startMs = timestampToMs(timeMatch[1]);
      endMs = timestampToMs(timeMatch[2]);
    } catch {
      i += 1;
      continue;
    }

    i += 2;
    const textParts = [];
    while (i < lines.length && lines[i].trim() !== '') {
      textParts.push(lines[i].trim());
      i += 1;
    }

    blocks.push({ index: Number(line), startMs, endMs, text: textParts.join(' ') });
  }

  return blocks;
}