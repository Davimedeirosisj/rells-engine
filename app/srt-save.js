(() => {
  'use strict';

  async function saveSrtToChosenLocation(button) {
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = '[ESCOLHENDO DESTINO…]';

    try {
      const stage = document.querySelector('#stage1');
      const projectButton = stage?.querySelector('#srt-download-btn');
      if (!projectButton) throw new Error('Botão de SRT não encontrado.');

      // O botão original é criado dinamicamente pelo app.js. O endpoint resolve
      // o projeto pela rota atual do botão original, portanto interceptamos
      // somente a ação de download e usamos o conteúdo retornado.
      const href = projectButton.dataset.srtUrl || '/api/projects';
      const match = href.match(/\/api\/projects\/([^/]+)\/srt$/);
      const fallbackProject = button.dataset.project;
      const url = match ? href : (fallbackProject ? `/api/projects/${encodeURIComponent(fallbackProject)}/srt` : null);
      if (!url) {
        // Descobre o projeto pelo último projeto exibido que esteja pronto.
        const response = await fetch('/api/projects');
        const data = await response.json();
        const ready = (data.projects || []).find((p) => p.transcription?.status === 'SRT_READY' || p.sourceSrt);
        if (!ready) throw new Error('Não foi possível identificar o projeto do SRT.');
        return await saveFromUrl(`/api/projects/${encodeURIComponent(ready.name)}/srt`);
      }
      return await saveFromUrl(url);
    } catch (error) {
      console.error('[RELLS] Falha ao salvar SRT:', error);
      const msg = error?.message || 'Falha ao salvar o SRT.';
      if (typeof window.showMessage === 'function') window.showMessage('Erro ao salvar SRT: ' + msg, 'error');
      else alert('Erro ao salvar SRT: ' + msg);
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  async function saveFromUrl(url) {
    const response = await fetch(url);
    if (!response.ok) {
      let message = 'Falha ao obter o SRT.';
      try { message = (await response.json()).error || message; } catch {}
      throw new Error(message);
    }

    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const filenameMatch = disposition.match(/filename="?([^";]+)"?/i);
    const suggestedName = filenameMatch?.[1] || 'transcricao.srt';

    if ('showSaveFilePicker' in window) {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [{
          description: 'Legenda SubRip',
          accept: { 'application/x-subrip': ['.srt'] },
        }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      if (typeof window.showMessage === 'function') window.showMessage(`SRT salvo em "${handle.name}".`, 'success');
      return;
    }

    // Fallback para navegadores sem File System Access API.
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = suggestedName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
    if (typeof window.showMessage === 'function') {
      window.showMessage('Seu navegador não permite escolher a pasta diretamente. O download foi iniciado.', 'success');
    }
  }

  // Captura em fase de captura para impedir o listener original do app.js.
  document.addEventListener('click', (event) => {
    const button = event.target.closest('#srt-download-btn');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    saveSrtToChosenLocation(button);
  }, true);
})();
