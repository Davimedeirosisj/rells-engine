(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  function escHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  async function jsonApi(path, opts = {}) {
    const response = await fetch(path, opts);
    let data = null;
    try { data = await response.json(); } catch (_) {}
    if (!response.ok) {
      throw new Error((data && data.error) || `Erro ${response.status}`);
    }
    return data;
  }

  function setMessage(message, type = 'success') {
    const el = $('#stage-message');
    if (!el) return;
    el.textContent = message;
    el.className = 'stage-message ' + type;
    el.hidden = false;
    if (window.toast) window.toast(message, type === 'error' ? 'error' : 'success');
  }

  function setResult(html) {
    const el = $('#cuts-result');
    if (!el) return;
    el.hidden = false;
    el.classList.remove('hidden');
    el.innerHTML = html;
  }

  function install() {
    const projectSelect = $('#cut-project-select');
    const cortesInput = $('#cortes');
    const processBtn = $('#process-btn');
    const validateBtn = $('#validate-btn');

    if (!projectSelect || !cortesInput) return;

    // O fluxo unificado substitui os dois botões antigos na operação normal.
    if (validateBtn) validateBtn.style.display = 'none';
    if (processBtn) processBtn.style.display = 'none';

    const row = processBtn?.parentElement || validateBtn?.parentElement;
    if (!row) return;

    let button = $('#import-process-btn');
    if (!button) {
      button = document.createElement('button');
      button.id = 'import-process-btn';
      button.className = 'btn btn-primary';
      button.type = 'button';
      button.textContent = 'IMPORTAR, PROCESSAR E BAIXAR ZIP';
      button.setAttribute('aria-describedby', 'cuts-help');
      row.appendChild(button);
    }

    const updateState = () => {
      button.disabled = !(projectSelect.value && cortesInput.files?.[0]);
      if (button.textContent === 'CONCLUÍDO ✓') {
        button.textContent = 'IMPORTAR, PROCESSAR E BAIXAR ZIP';
      }
    };

    cortesInput.addEventListener('change', updateState);
    projectSelect.addEventListener('change', updateState);
    updateState();

    button.addEventListener('click', async () => {
      const projectName = projectSelect.value;
      const file = cortesInput.files?.[0];

      if (!projectName) return setMessage('Selecione o projeto.', 'error');
      if (!file) return setMessage('Selecione um cortes.json para importar.', 'error');

      button.disabled = true;
      button.dataset.running = 'true';
      projectSelect.disabled = true;
      cortesInput.disabled = true;
      button.textContent = 'IMPORTANDO CORTES...';
      setResult('<div class="summary">Importando e validando cortes...</div>');

      try {
        const form = new FormData();
        form.append('cortes', file);

        const imported = await jsonApi(
          `/api/projects/${encodeURIComponent(projectName)}/cuts/import`,
          { method: 'POST', body: form }
        );

        const summary = imported.cuts || { total: 0, valid: 0, errors: [] };
        const errors = summary.errors || [];

        if (!imported.ok || errors.length) {
          throw new Error(
            errors.length
              ? `${errors.length} erro(s) de validação no servidor.`
              : 'Falha ao importar os cortes.'
          );
        }

        button.textContent = `PROCESSANDO ${summary.valid} CORTES...`;
        setResult(
          `<div class="summary">✓ ${summary.valid} de ${summary.total} cortes validados</div>` +
          '<div class="fine">Processando com FFmpeg...</div>'
        );

        await jsonApi(
          `/api/projects/${encodeURIComponent(projectName)}/generate-all`,
          { method: 'POST' }
        );
        if (window.setBatchRunning) window.setBatchRunning(true);

        const progress = await window.waitForBatchCompletion(projectName);
        if (window.setBatchRunning) window.setBatchRunning(false);
        if (window.refreshProjects) await window.refreshProjects();
        const project = await jsonApi(`/api/projects/${encodeURIComponent(projectName)}`);
        const cuts = project.project?.manifest?.cuts || [];
        const results = {
          total: cuts.length,
          completed: cuts.filter((cut) => cut.status === 'CONCLUÍDO').length,
          failed: cuts.filter((cut) => cut.status === 'ERRO').length,
        };
        if (progress.status === 'ERROR' || progress.status === 'CANCELLED') {
          throw new Error(progress.message || 'Falha ao processar os cortes.');
        }
        if (results.failed) {
          throw new Error(`${results.failed} corte(s) falharam durante o processamento.`);
        }

        button.textContent = 'GERANDO ZIP...';
        setResult(
          `<div class="summary">✓ ${results.completed} de ${results.total} corte(s) gerados</div>` +
          '<div class="fine">Gerando ZIP...</div>'
        );

        const exported = await jsonApi(
          `/api/projects/${encodeURIComponent(projectName)}/export`,
          { method: 'POST' }
        );

        if (!exported.ok || !exported.url) {
          throw new Error(exported.error || 'Falha ao gerar o ZIP.');
        }

        // IMPORTANTE: não usar fetch()/blob() no download.
        // O navegador baixa diretamente do endpoint HTTP e evita ERR_FAILED 200 (OK).
        const downloadUrl = exported.url;
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = exported.zipName || `${projectName}-cortes.zip`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        link.remove();

        button.textContent = 'CONCLUÍDO ✓';
        setResult(
          `<div class="summary">✓ ${results.completed} corte(s) processados</div>` +
          `<div class="fine">ZIP ${escHtml(exported.zipName || '')} baixado.</div>`
        );
        setMessage('Cortes processados e download do ZIP iniciado.', 'success');

      } catch (error) {
        if (window.setBatchRunning) window.setBatchRunning(false);
        console.error('[UX3]', error);
        button.textContent = 'IMPORTAR, PROCESSAR E BAIXAR ZIP';
        setMessage(error.message || 'Erro no fluxo de cortes.', 'error');
        setResult(
          `<div class="summary" style="color:var(--red)">✕ Falha no fluxo</div>` +
          `<div class="fine">${escHtml(error.message || 'Erro desconhecido.')}</div>`
        );
      } finally {
        button.dataset.running = 'false';
        projectSelect.disabled = false;
        cortesInput.disabled = false;
        if (button.textContent !== 'CONCLUÍDO ✓') updateState();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
