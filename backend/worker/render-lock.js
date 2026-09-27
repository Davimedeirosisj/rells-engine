const activeRenders = new Map(); // projectName → { release, timeoutId }

export function acquireProjectRender(projectName, mode = 'processamento') {
  if (activeRenders.has(projectName)) {
    throw new Error(`Já existe um ${mode} em andamento para o projeto "${projectName}".`);
  }

  activeRenders.set(projectName, { release: null, timeoutId: null });
  
  let released = false;
  const cleanup = () => {
    if (released) return;
    released = true;
    clearTimeout(activeRenders.get(projectName).timeoutId);
    activeRenders.delete(projectName);
  };

  // Timeout automático de 10min para liberar locks abandonados
  activeRenders.get(projectName).timeoutId = setTimeout(cleanup, 600_000);
  
  return cleanup;
}

export function isProjectRenderActive(projectName) {
  return activeRenders.has(projectName);
}
