import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCortes, validateCut, validateCuts } from '../backend/cortes.js';

const validCut = {
  id: 1,
  start: '00:16:28,280',
  end: '00:17:22,500',
  cover_hook: 'VOCÊ SÓ PENSA EM VOCÊ?',
  title: 'O problema de quem só olha para si',
  theme: 'O maior erro é pensar só em você',
  speech: 'texto literal',
  potential: 'alto',
};

test('parseCortes valida estrutura base', () => {
  const cortes = parseCortes(JSON.stringify({
    project: { name: 'X' },
    cuts: [],
  }));
  assert.equal(cortes.project.name, 'X');
  assert.deepEqual(cortes.cuts, []);

  assert.throws(() => parseCortes('{invalid'), /JSON válido/);
  assert.throws(() => parseCortes(JSON.stringify({ cuts: [] })), /project/);
  assert.throws(() => parseCortes(JSON.stringify({ project: {} })), /cuts/);
});

test('validateCut valida campos obrigatórios', () => {
  const missing = { ...validCut };
  delete missing.title;
  const r = validateCut(missing, 0, undefined);
  assert.equal(r.ok, false);
  assert.match(r.error, /title/);
});

test('validateCut exige id inteiro', () => {
  assert.equal(validateCut(validCut, 0, undefined).ok, true);
  assert.equal(validateCut({ ...validCut, id: 'x' }, 0, undefined).ok, false);
});

test('validateCut valida START < END', () => {
  const bad = { ...validCut, start: '00:17:22,500', end: '00:16:28,280' };
  const r = validateCut(bad, 0, undefined);
  assert.equal(r.ok, false);
  assert.match(r.error, /maior ou igual/);

  const equal = { ...validCut, start: '00:00:01,000', end: '00:00:01,000' };
  assert.equal(validateCut(equal, 0, undefined).ok, false);
});

test('validateCut valida END <= duração do vídeo', () => {
  const durationMs = timestampHelper('00:20:00,000');
  assert.equal(validateCut(validCut, 0, durationMs).ok, true);

  const over = { ...validCut, end: '00:30:00,000' };
  const r = validateCut(over, 0, durationMs);
  assert.equal(r.ok, false);
  assert.match(r.error, /além da duração/);
});

test('validateCut rejeita timestamp inválido', () => {
  const r = validateCut({ ...validCut, start: 'garbage' }, 0, undefined);
  assert.equal(r.ok, false);
  assert.match(r.error, /inválido/);
});

test('validateCuts separa válidos de erros', () => {
  const cortes = { cuts: [validCut, { ...validCut, id: 2, start: 'bad' }] };
  const res = validateCuts(cortes, undefined);
  assert.equal(res.valid.length, 1);
  assert.equal(res.errors.length, 1);
});

function timestampHelper(s) {
  const m = s.match(/^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/);
  return ((+m[1] * 3600 + +m[2] * 60 + +m[3]) * 1000) + +m[4];
}