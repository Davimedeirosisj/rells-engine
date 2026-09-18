import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../backend/server.js';
import { config } from '../backend/config.js';

const originalSettingsPath = config.globalSettingsPath;
let tmpSettings = '';
let server;
let base = '';

before(async () => {
  tmpSettings = path.join(os.tmpdir(), `rells-test-settings-${Date.now()}.json`);
  config.globalSettingsPath = tmpSettings;
  const app = createApp();
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmpSettings, { force: true });
  config.globalSettingsPath = originalSettingsPath;
});

async function api(method, url, body) {
  const opts = { method, headers: {} };
  if (body) { opts.headers['content-type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch(base + url, opts);
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

test('GET /api/settings retorna padrões', async () => {
  const { status, data } = await api('GET', '/api/settings');
  assert.equal(status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.settings.titleMode, 'overlay');
  assert.equal(data.settings.showArroba, true);
});

test('PUT /api/settings salva novas opções', async () => {
  const { status, data } = await api('PUT', '/api/settings', { titleMode: 'filename', showArroba: false });
  assert.equal(status, 200);
  assert.equal(data.settings.titleMode, 'filename');
  assert.equal(data.settings.showArroba, false);

  const again = await api('GET', '/api/settings');
  assert.equal(again.data.settings.titleMode, 'filename');
  assert.equal(again.data.settings.showArroba, false);
});

test('PUT /api/settings rejeita titleMode inválido', async () => {
  const { status } = await api('PUT', '/api/settings', { titleMode: 'zzz' });
  assert.equal(status, 400);
});

test('PUT /api/projects/:name/settings para projeto inexistente retorna 400', async () => {
  const { status } = await api('PUT', '/api/projects/proj_nao_existe_x/settings', { titleMode: 'hidden' });
  assert.equal(status, 400);
});

test('PUT /api/projects/:name/cuts/:id/options para projeto inexistente retorna 400', async () => {
  const { status } = await api('PUT', '/api/projects/proj_nao_existe_x/cuts/1/options', { titleMode: 'hidden' });
  assert.equal(status, 400);
});

test('PUT /api/projects/:name/cuts/:id/options com titleMode inválido retorna 400', async () => {
  const { status } = await api('PUT', '/api/projects/proj_x/cuts/7/options', { titleMode: 'zzz' });
  assert.equal(status, 400);
});