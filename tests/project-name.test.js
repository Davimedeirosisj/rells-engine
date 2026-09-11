import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeProjectName } from '../backend/fs-utils.js';
import { parseProjectName, defaultProjectName } from '../backend/project.js';

test('sanitizeProjectName preserva acentos e espaços', () => {
  assert.equal(sanitizeProjectName('CULTO - 08 setembro 2026'), 'CULTO - 08 setembro 2026');
  assert.equal(sanitizeProjectName(' Culto  da  Família '), 'Culto da Família');
});

test('sanitizeProjectName troca / por - (nome padrão da data)', () => {
  assert.equal(sanitizeProjectName('Projeto 11/09/2026'), 'Projeto 11-09-2026');
});

test('sanitizeProjectName troca \\ por -', () => {
  assert.equal(sanitizeProjectName('Projeto\\Culto'), 'Projeto-Culto');
  assert.equal(sanitizeProjectName('a\\b/c'), 'a-b-c');
});

test('sanitizeProjectName remove caracteres inválidos do Windows', () => {
  assert.equal(sanitizeProjectName('a<b>c:d"e|f?g*h'), 'abcdefgh');
});

test('sanitizeProjectName bloqueia path traversal e nomes absolutos', () => {
  assert.equal(sanitizeProjectName('../projeto', { fallback: 'FALLBACK' }), 'FALLBACK');
  assert.equal(sanitizeProjectName('..\\projeto', { fallback: 'FALLBACK' }), 'FALLBACK');
  assert.equal(sanitizeProjectName('projeto/..', { fallback: 'FALLBACK' }), 'FALLBACK');
  assert.equal(sanitizeProjectName('..', { fallback: 'FALLBACK' }), 'FALLBACK');
  assert.equal(sanitizeProjectName('.', { fallback: 'FALLBACK' }), 'FALLBACK');
  assert.equal(sanitizeProjectName('/absoluto', { fallback: 'FALLBACK' }), 'FALLBACK');
  assert.equal(sanitizeProjectName('C:\\windows', { fallback: 'FALLBACK' }), 'FALLBACK');
  assert.equal(sanitizeProjectName('', { fallback: 'FALLBACK' }), 'FALLBACK');
  assert.equal(sanitizeProjectName('   ', { fallback: 'FALLBACK' }), 'FALLBACK');
});

test('parseProjectName usa a sanitização de nome de projeto', () => {
  assert.equal(parseProjectName({ project: { name: 'CULTO - 08 setembro 2026' } }), 'CULTO - 08 setembro 2026');
  assert.equal(parseProjectName({ project: { name: 'a/b' } }), 'a-b');
  assert.equal(parseProjectName({ project: { name: '..\\projeto' } }), null);
  assert.equal(parseProjectName({ project: { name: '../projeto' } }), null);
  assert.equal(parseProjectName({ project: { name: '' } }), null);
  assert.equal(parseProjectName({}), null);
});

test('defaultProjectName gera nome seguro a partir da data (sem barras)', () => {
  const name = defaultProjectName(new Date(2026, 8, 11, 12, 0, 0));
  assert.equal(name, 'Projeto 11-09-2026');
  assert.doesNotMatch(name, /[\\/]/);
});

test('defaultProjectName sempre retorna um nome válido de pasta', () => {
  const name = defaultProjectName();
  assert.ok(name);
  assert.doesNotMatch(name, /[<>:"/\\|?*\u0000-\u001f]/);
});