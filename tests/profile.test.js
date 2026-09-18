import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildProfileFilter, buildProfileInputs } from '../backend/profile.js';

function tempPng() {
  const p = path.join(os.tmpdir(), `rells-profile-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.png`);
  fs.writeFileSync(p, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  return p;
}

test('buildProfileInputs retorna o PNG quando existe', () => {
  const png = tempPng();
  try {
    assert.deepEqual(buildProfileInputs({ arrobaPath: png }), [png]);
  } finally {
    fs.rmSync(png, { force: true });
  }
});

test('buildProfileInputs retorna lista vazia sem PNG', () => {
  assert.deepEqual(buildProfileInputs({ arrobaPath: null }), []);
  assert.deepEqual(buildProfileInputs({ arrobaPath: 'C:/nao/existe.png' }), []);
});

test('buildProfileFilter sobrepõe o PNG da arroba por inteiro (1080x1920)', () => {
  const png = tempPng();
  try {
    const r = buildProfileFilter({ arrobaPath: png, inputLabel: 'base' });
    assert.ok(r.filter.includes('[1:v]format=rgba[arroba]'));
    assert.ok(r.filter.includes('[base][arroba]overlay=0:0[v]'));
    assert.equal(r.lastLabel, 'v');
  } finally {
    fs.rmSync(png, { force: true });
  }
});

test('buildProfileFilter sem perfil retorna vazio e último label = inputLabel', () => {
  const r = buildProfileFilter({ arrobaPath: null, inputLabel: 'base' });
  assert.equal(r.filter, '');
  assert.equal(r.lastLabel, 'base');
});