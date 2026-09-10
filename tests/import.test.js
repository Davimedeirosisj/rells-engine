import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { sanitizeFilename, safeJoin, validateExtension } from '../backend/fs-utils.js';
import { parseProjectName } from '../backend/project.js';

test('sanitizeFilename remove caracteres inválidos do Windows', () => {
  assert.equal(sanitizeFilename('CULTO - 08 setembro 2026'), 'CULTO - 08 setembro 2026');
  assert.equal(sanitizeFilename('a<b>c:d"e/f\\g|h?i*j'), 'abcdefghij');
  assert.equal(sanitizeFilename('  espaços   extras  '), 'espaços extras');
  assert.equal(sanitizeFilename(''), 'sem-nome');
});

test('safeJoin bloqueia path traversal', () => {
  const base = 'C:\\base';
  assert.equal(safeJoin(base, 'projeto'), path.join(base, 'projeto'));
  assert.throws(() => safeJoin(base, '..', 'fora'), /path traversal/);
  assert.throws(() => safeJoin(base, '..\\..\\..\\windows'), /path traversal/);
});

test('validateExtension aceita somente extensões permitidas', () => {
  assert.equal(validateExtension('culto.mp4', 'video'), '.mp4');
  assert.equal(validateExtension('CULTO.MOV', 'video'), '.mov');
  assert.equal(validateExtension('legenda.srt', 'srt'), '.srt');
  assert.equal(validateExtension('cortes.json', 'json'), '.json');
  assert.throws(() => validateExtension('culto.exe', 'video'), /Extensão inválida/);
  assert.throws(() => validateExtension('legenda.txt', 'srt'), /Extensão inválida/);
});

test('parseProjectName extrai e sanitiza project.name', () => {
  assert.equal(
    parseProjectName({ project: { name: 'CULTO - 08 setembro 2026' } }),
    'CULTO - 08 setembro 2026',
  );
  assert.equal(parseProjectName({ project: { name: 'a<b>c' } }), 'abc');
  assert.equal(parseProjectName({ project: { name: '' } }), null);
  assert.equal(parseProjectName({}), null);
});