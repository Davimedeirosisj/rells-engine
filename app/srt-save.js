(() => {
  'use strict';

  function notify(message, type = 'success') {
    const el = document.querySelector('#stage-message');
    if (el) {
      el.textContent = message;
      el.className = 'stage-message ' + type;
      el.hidden = false;
    } else {
      alert(message);
    }
  }

  function activeProjectName() {
    const text = document.querySelector('#stage-message')?.textContent || '';
    const match = text.match(/Projeto\s+"([^"]+)"/i);
    return match?.[1] || null;
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
        types: [{ description: 'Legenda SubRip', accept: { 'application/x-subrip': ['.srt'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      notify(`SRT salvo como "${handle.name}" na pasta escolhida.`, 'success');
      return;
    }

    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = suggestedName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
    notify('Seu navegador não permite escolher a pasta diretamente. O download foi iniciado.', 'success');
  }

  async function handle(button) {
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = '[ESCOLHENDO DESTINO…]';
    try {
      const projectName = activeProjectName();
      if (!projectName) throw new Error('Não foi possível identificar o projeto da transcrição.');
      await saveFromUrl(`/api/projects/${encodeURIComponent(projectName)}/srt`);
    } catch (error) {
      if (error?.name === 'AbortError') notify('Salvamento cancelado.', 'error');
      else {
        console.error('[RELLS] Falha ao salvar SRT:', error);
        notify('Erro ao salvar SRT: ' + (error?.message || 'falha desconhecida'), 'error');
      }
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('#srt-download-btn');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    handle(button);
  }, true);
})();
