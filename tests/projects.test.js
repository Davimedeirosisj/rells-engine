import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { listProjects, getProject } from '../backend/projects.js';
import { config } from '../backend/config.js';

const projectsDir = config.dirs.projects;

async function withTempProject(run) {
  const name = '__test_proj_' + Date.now();
  const dir = path.join(projectsDir, name);
  await fs.mkdir(path.join(dir, 'output'), { recursive: true });
  await fs.mkdir(path.join(dir, 'temp'), { recursive: true });
  await fs.writeFile(
    path.join(dir, 'manifest.json'),
    JSON.stringify({
      project: name,
      importedAt: new Date().toISOString(),
      cuts: [],
      validationErrors: [],
    }),
  );
  try {
    await run(name);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('listProjects retorna projetos com manifest', async () => {
  await withTempProject(async (name) => {
    const projects = await listProjects();
    const found = projects.find((p) => p.name === name);
    assert.ok(found);
    assert.equal(found.title, name);
  });
});

test('getProject retorna manifest do projeto', async () => {
  await withTempProject(async (name) => {
    const p = await getProject(name);
    assert.equal(p.name, name);
    assert.ok(p.manifest);
    assert.equal(p.manifest.project, name);
  });
});

test('getProject lança erro para projeto inexistente', async () => {
  await assert.rejects(() => getProject('nao_existe_12345'));
});

test('getProject bloqueia path traversal', async () => {
  await assert.rejects(() => getProject('..\\..\\windows'), /path traversal/i);
});