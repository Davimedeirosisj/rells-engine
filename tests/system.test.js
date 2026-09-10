import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../backend/config.js';
import { checkFont } from '../backend/system.js';

test('config expõe diretórios e porta padrão', () => {
  assert.equal(config.port, 3000);
  assert.equal(typeof config.rootDir, 'string');
  assert.ok(config.dirs.projects.length > 0);
  assert.ok(config.dirs.fonts.length > 0);
});

test('fontPath aponta para Gobold-Bold.ttf', () => {
  assert.ok(config.fontPath.endsWith('Gobold-Bold.ttf'));
});

test('checkFont retorna exists e path', () => {
  const r = checkFont();
  assert.equal(typeof r.exists, 'boolean');
  assert.equal(r.path, config.fontPath);
});