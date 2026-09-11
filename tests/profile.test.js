import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProfileFilter, buildProfileInputs, PROFILE_Y_RATIO } from '../backend/profile.js';

const AVATAR = 'C:\\WINDOWS\\Fonts\\arialbd.ttf';
const FONT = 'C:\\WINDOWS\\Fonts\\arialbd.ttf';

test('buildProfileInputs retorna apenas inputs existentes', () => {
  const r = buildProfileInputs({ avatarPath: AVATAR, verificationPath: 'C:/nao/existe.png' });
  assert.deepEqual(r, [AVATAR]);
});

test('buildProfileFilter gera overlay de avatar e drawtext do handle', () => {
  const r = buildProfileFilter({
    handle: '@apostololuizhenrique',
    fontPath: FONT,
    avatarPath: AVATAR,
    verificationPath: null,
  });
  assert.ok(r.filter.includes('overlay='));
  assert.ok(r.filter.includes('drawtext'));
  assert.ok(r.filter.includes("text='@apostololuizhenrique'"));
  assert.equal(r.lastLabel, 'withhandle');
});

test('buildProfileFilter sem perfil retorna vazio e último label = inputLabel', () => {
  const r = buildProfileFilter({ handle: '', avatarPath: null, verificationPath: null, inputLabel: 'base' });
  assert.equal(r.filter, '');
  assert.equal(r.lastLabel, 'base');
});

test('PROFILE_Y_RATIO está definido como ~78%', () => {
  assert.equal(PROFILE_Y_RATIO, 0.78);
});