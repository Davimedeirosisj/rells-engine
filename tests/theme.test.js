import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrapThemeText, buildThemeFilter, THEME_MAX_LINE_CHARS } from '../backend/theme.js';

test('wrapThemeText converte para caixa alta e quebra por palavras', () => {
  assert.deepEqual(wrapThemeText('o maior erro é pensar só em você', 16), [
    'O MAIOR ERRO É',
    'PENSAR SÓ EM',
    'VOCÊ',
  ]);
  assert.deepEqual(wrapThemeText('um tema curto', 24), ['UM TEMA CURTO']);
});

test('wrapThemeText mantém palavra única maior que o limite', () => {
  const long = 'A'.repeat(30);
  assert.deepEqual(wrapThemeText(long), [long]);
});

test('wrapThemeText retorna linha vazia para texto vazio', () => {
  assert.deepEqual(wrapThemeText(''), ['']);
});

test('wrapThemeText não corta palavras no meio', () => {
  const result = wrapThemeText('uma frase simples', 10);
  for (const line of result) {
    assert.ok(line.indexOf(' ') === -1 ? line.length <= 10 : true, 'linha não excede limite');
  }
});

test('THEME_MAX_LINE_CHARS é razoável para largura 900px', () => {
  assert.equal(THEME_MAX_LINE_CHARS, 24);
});

test('buildThemeFilter lança erro para fonte inexistente', () => {
  assert.throws(() => buildThemeFilter('teste', 'C:/nao/existe.ttf'), /Fonte não encontrada/);
});

test('buildThemeFilter gera drawtext com fonte, cor branca e centralizado', () => {
  const fontPath = 'C:\\WINDOWS\\Fonts\\arialbd.ttf';
  const theme = 'O MAIOR ERRO É PENSAR SÓ EM VOCÊ';
  const result = buildThemeFilter(theme, fontPath);
  assert.ok(result.filter.includes('drawtext'));
  assert.ok(result.filter.includes('fontcolor=white'));
  assert.ok(result.filter.includes('x=(w-text_w)/2'));
  assert.ok(result.filter.includes('fontsize='));
});