import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timestampToMs, msToTimestamp, isValidTimestamp } from '../backend/timestamp.js';

test('timestampToMs converte HH:MM:SS,mmm', () => {
  assert.equal(timestampToMs('00:16:28,280'), (16 * 60 + 28) * 1000 + 280);
  assert.equal(timestampToMs('00:00:00,000'), 0);
  assert.equal(timestampToMs('01:00:00,000'), 3600000);
});

test('timestampToMs converte HH:MM:SS.mmm (ponto)', () => {
  assert.equal(timestampToMs('00:00:01.500'), 1500);
});

test('timestampToMs converte segundos decimais', () => {
  assert.equal(timestampToMs('1.5'), 1500);
  assert.equal(timestampToMs('0.280'), 280);
  assert.equal(timestampToMs('2'), 2000);
});

test('timestampToMs aceita número', () => {
  assert.equal(timestampToMs(1.5), 1500);
});

test('timestampToMs arredonda ms com precisão (não arredonda para segundo)', () => {
  assert.equal(timestampToMs('00:00:00,280'), 280);
  assert.equal(timestampToMs('00:00:00,281'), 281);
});

test('msToTimestamp faz round-trip preservando ms', () => {
  assert.equal(msToTimestamp(timestampToMs('00:16:28,280')), '00:16:28,280');
  assert.equal(msToTimestamp(timestampToMs('00:17:22,500')), '00:17:22,500');
});

test('REGRA FUNDAMENTAL: 00:16:28,280 → 00:17:22,500 não é alterado', () => {
  const start = timestampToMs('00:16:28,280');
  const end = timestampToMs('00:17:22,500');
  assert.equal(msToTimestamp(start), '00:16:28,280');
  assert.equal(msToTimestamp(end), '00:17:22,500');
  assert.equal(start, (16 * 60 + 28) * 1000 + 280);
  assert.equal(end, (17 * 60 + 22) * 1000 + 500);
});

test('isValidTimestamp rejeita valores inválidos', () => {
  assert.equal(isValidTimestamp('00:16:28,280'), true);
  assert.equal(isValidTimestamp('abc'), false);
  assert.equal(isValidTimestamp('00:99:00,000'), false);
  assert.equal(isValidTimestamp('00:00:60,000'), false);
  assert.equal(isValidTimestamp('x:y:z'), false);
});

test('timestampToMs lança erro em timestamps malformados', () => {
  assert.throws(() => timestampToMs('00:00:60,000'), /Timestamp inválido/);
  assert.throws(() => timestampToMs('00:60:00,000'), /Timestamp inválido/);
  assert.throws(() => timestampToMs('aaa'), /Timestamp inválido/);
  assert.throws(() => timestampToMs('00:00:00,1000'), /Timestamp inválido/);
});