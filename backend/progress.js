const states = new Map();

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
  return next;
}

export function getProgress(projectName) {
  return states.get(projectName) || normalizeState();
}

export function clearProgress(projectName) {
  states.delete(projectName);
}
