const activeRenders = new Set();

export function acquireProjectRender(projectName, mode = 'processamento') {
  if (activeRenders.has(projectName)) {
    throw new Error(`Já existe um ${mode} em andamento para o projeto "${projectName}".`);
  }

  activeRenders.add(projectName);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeRenders.delete(projectName);
  };
}

export function isProjectRenderActive(projectName) {
  return activeRenders.has(projectName);
}
