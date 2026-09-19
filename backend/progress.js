import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { saveManifest } from './projects.js';

const states = new Map();
const persistedAt = new Map();

function statePath(projectName) {
  return path.join(config.dirs.projects, projectName, 'temp', 'progress.json');
}

function loadPersisted(projectName) {
  try {
    return JSON.parse(fs.readFileSync(statePath(projectName), 'utf8'));
  } catch {
    return null;
  }
}

function normalizeState(state = {}) {
  return {
    status: state.status || 'IDLE',
    stage: state.stage || null,
    progress: Number.isFinite(state.progress) ? Math.max(0, Math.min(100, state.progress)) : 0,
    elapsedSeconds: Number.isFinite(state.elapsedSeconds) ? Math.max(0, state.elapsedSeconds) : 0,
    estimatedRemainingSeconds: Number.isFinite(state.estimatedRemainingSeconds) ? Math.max(0, state.estimatedRemainingSeconds) : null,
    speed: Number.isFinite(state.speed) ? state.speed : null,
    currentTimeMs: Number.isFinite(state.currentTimeMs) ? state.currentTimeMs : null,
    totalDurationMs: Number.isFinite(state.totalDurationMs) ? state.totalDurationMs : null,
    currentCut: Number.isFinite(state.currentCut) ? state.currentCut : null,
    totalCuts: Number.isFinite(state.totalCuts) ? state.totalCuts : null,
    currentTitle: state.currentTitle || null,
    message: state.message || null,
    startedAt: state.startedAt || null,
    updatedAt: new Date().toISOString(),
  };
}

export function setProgress(projectName, state) {
  const next = normalizeState({ ...states.get(projectName), ...state });
  states.set(projectName, next);
  const now = Date.now();
  const shouldPersist = ['COMPLETED', 'ERROR', 'CANCELLED'].includes(next.status)
    || !persistedAt.has(projectName)
    || now - persistedAt.get(projectName) >= 500;
  if (shouldPersist) {
    try {
      const projectDir = path.join(config.dirs.projects, projectName);
      if (!fs.existsSync(projectDir)) return next;
      const filePath = statePath(projectName);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(next, null, 2), 'utf8');
      persistedAt.set(projectName, now);
    } catch {
      // Progresso em memória continua disponível mesmo se o disco falhar.
    }
  }
  return next;
}

export function getProgress(projectName) {
  if (states.has(projectName)) return states.get(projectName);
  const persisted = loadPersisted(projectName);
  if (persisted) {
    const restored = normalizeState(persisted);
    states.set(projectName, restored);
    return restored;
  }
  return normalizeState();
}

export function clearProgress(projectName) {
  states.delete(projectName);
  persistedAt.delete(projectName);
}

export async function recoverInterruptedJobs() {
  if (!fs.existsSync(config.dirs.projects)) return;
  const entries = await fs.promises.readdir(config.dirs.projects, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const projectName = entry.name;
    const manifestPath = path.join(config.dirs.projects, projectName, 'manifest.json');
    try {
      const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8'));
      let changed = false;
      for (const cut of manifest.cuts || []) {
        if (cut.status === 'PROCESSANDO') {
          cut.status = 'ERRO';
          cut.error = 'Processamento interrompido porque o servidor foi reiniciado.';
          changed = true;
        }
      }
      if (manifest.transcription?.status === 'TRANSCRIBING') {
        manifest.transcription = {
          ...manifest.transcription,
          status: 'ERROR',
          error: 'Transcrição interrompida porque o servidor foi reiniciado.',
          failedAt: new Date().toISOString(),
        };
        changed = true;
      }
      if (changed) await saveManifest(projectName, manifest);
      const persisted = loadPersisted(projectName);
      if (persisted && ['PROCESSING', 'TRANSCRIBING'].includes(persisted.status)) {
        setProgress(projectName, {
          status: 'ERROR',
          message: 'Job interrompido porque o servidor foi reiniciado.',
        });
      }
    } catch {
      // Projetos incompletos ou manifests inválidos não impedem o boot.
    }
  }
}
