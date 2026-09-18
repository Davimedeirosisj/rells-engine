import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from '../backend/config.js';
import { resolveRenderOptions } from '../backend/render-options.js';
import { getGlobalSettings, saveGlobalSettings } from '../backend/settings.js';

function tempPng() {
  const p = path.join(os.tmpdir(), `rells-render-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.png`);
  fs.writeFileSync(p, 'png');
  return p;
}

function withCleanGlobal(projectDir, fn) {
  const originalPath = config.globalSettingsPath;
  config.globalSettingsPath = path.join(os.tmpdir(), `rells-settings-${Date.now()}.json`);
  const originalArroba = config.arrobaPath;
  config.arrobaPath = '';
  try {
    return fn(projectDir);
  } finally {
    fs.rmSync(config.globalSettingsPath, { force: true });
    config.globalSettingsPath = originalPath;
    config.arrobaPath = originalArroba;
  }
}

test('padrão sem nenhuma opção = overlay + arroba ativo', () => {
  withCleanGlobal(null, () => {
    const r = resolveRenderOptions({}, {});
    assert.equal(r.titleMode, 'overlay');
    assert.equal(r.showArroba, true);
  });
});

test('global define o padrão', () => {
  withCleanGlobal(null, () => {
    saveGlobalSettings({ titleMode: 'filename', showArroba: false });
    const r = resolveRenderOptions({}, {});
    assert.equal(r.titleMode, 'filename');
    assert.equal(r.showArroba, false);
    assert.equal(r.handleImagePath, null);
  });
});

test('projeto sobrescreve global, corte sobrescreve projeto', () => {
  withCleanGlobal(null, () => {
    saveGlobalSettings({ titleMode: 'hidden', showArroba: true });

    const project = { titleMode: 'filename' };
    assert.equal(resolveRenderOptions({}, { projectSettings: project }).titleMode, 'filename');

    const cut = { options: { titleMode: 'overlay' } };
    const r = resolveRenderOptions(cut, { projectSettings: project });
    assert.equal(r.titleMode, 'overlay');
    assert.equal(r.showArroba, true);
  });
});

test('showArroba off ignora PNGs e retorna handleImagePath null', () => {
  withCleanGlobal(null, () => {
    const png = tempPng();
    try {
      saveGlobalSettings({ arroba: png });
      const on = resolveRenderOptions({}, {});
      assert.ok(on.handleImagePath);

      const r = resolveRenderOptions({ options: { showArroba: false } }, {});
      assert.equal(r.showArroba, false);
      assert.equal(r.handleImagePath, null);
    } finally {
      fs.rmSync(png, { force: true });
    }
  });
});

test('arroba do projeto tem prioridade sobre a global', () => {
  withCleanGlobal(null, () => {
    const globalPng = tempPng();
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rells-proj-'));
    const projectPng = path.join(projectDir, 'assets', 'arroba.png');
    fs.mkdirSync(path.dirname(projectPng), { recursive: true });
    fs.writeFileSync(projectPng, 'png');
    try {
      saveGlobalSettings({ arroba: globalPng });
      const r = resolveRenderOptions({}, { projectDir });
      assert.equal(r.handleImagePath, projectPng);
    } finally {
      fs.rmSync(globalPng, { force: true });
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });
});

test('settings persistidas são relidas por getGlobalSettings', () => {
  const originalPath = config.globalSettingsPath;
  config.globalSettingsPath = path.join(os.tmpdir(), `rells-settings-${Date.now()}.json`);
  try {
    saveGlobalSettings({ titleMode: 'hidden', showArroba: false });
    const g = getGlobalSettings();
    assert.equal(g.titleMode, 'hidden');
    assert.equal(g.showArroba, false);
  } finally {
    fs.rmSync(config.globalSettingsPath, { force: true });
    config.globalSettingsPath = originalPath;
  }
});