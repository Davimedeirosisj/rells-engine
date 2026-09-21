const HH_MM_SS_MS = /^(\d{1,2}):(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/;
const HH_MM_SS_CENTI = /^(\d{1,2}):(\d{1,2}):(\d{1,2}):(\d{1,2})$/;
const SECONDS_DECIMAL = /^(\d+(?:\.\d{1,3})?)$/;

export function timestampToMs(input) {
  if (typeof input === 'number') {
    return Math.round(input * 1000);
  }

  const str = String(input).trim();

  const hms = str.match(HH_MM_SS_MS);
  if (hms) {
    const h = parseInt(hms[1], 10);
    const m = parseInt(hms[2], 10);
    const s = parseInt(hms[3], 10);
    const msRaw = hms[4].padEnd(3, '0');
    const ms = parseInt(msRaw, 10);

    if (m >= 60 || s >= 60 || ms > 999) {
      throw new Error(`Timestamp inválido: "${input}"`);
    }

    return ((h * 3600 + m * 60 + s) * 1000) + ms;
  }

  const hmstc = str.match(HH_MM_SS_CENTI);
  if (hmstc) {
    const h = parseInt(hmstc[1], 10);
    const m = parseInt(hmstc[2], 10);
    const s = parseInt(hmstc[3], 10);
    const c = parseInt(hmstc[4], 10);

    if (m >= 60 || s >= 60 || c > 99) {
      throw new Error(`Timestamp inválido: "${input}"`);
    }

    return ((h * 3600 + m * 60 + s) * 1000) + c * 10;
  }

  const sec = str.match(SECONDS_DECIMAL);
  if (sec) {
    const value = parseFloat(sec[1]);
    return Math.round(value * 1000);
  }

  throw new Error(`Timestamp inválido: "${input}"`);
}

export function msToTimestamp(ms, useComma = true) {
  const totalMs = Math.round(ms);
  const h = Math.floor(totalMs / 3600000);
  const m = Math.floor((totalMs % 3600000) / 60000);
  const s = Math.floor((totalMs % 60000) / 1000);
  const msPart = totalMs % 1000;

  const pad = (n, len = 2) => String(n).padStart(len, '0');
  const sep = useComma ? ',' : '.';

  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(msPart, 3)}`;
}

export function isValidTimestamp(input) {
  try {
    timestampToMs(input);
    return true;
  } catch {
    return false;
  }
}