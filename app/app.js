/* ============ RELLS ENGINE — APP ============ */
(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // ---- Estado global ----
  const state = {
    projects: [],   // lista de projetos (GET /api/projects)
    current: null,  // projeto aberto em detalhe (GET /api/projects/:name)
    stage1: 'IDLE', // IDLE | UPLOADING | TRANSCRIBING | SRT_READY | ERROR
    stage2: 'IDLE', // IDLE | CUTS_READY | VALIDATING | PROCESSING | COMPLETED | ERROR
    transcribingProject: null,
    batchRunning: false,
    query: '',
    sortKey: 'importedAt',
    sortDir: -1,
  };

  // ---- Toasts ----
  function toast(message, type = 'info', timeout = 4200) {
    const container = $('#toasts') || (() => {
      const c = document.createElement('div');
      c.id = 'toasts';
      c.className = 'toasts';
      c.setAttribute('role', 'status');
      c.setAttribute('aria-live', 'polite');
      document.body.appendChild(c);
      return c;
    })();
    const el = document.createElement('div');
    el.className = 'toast ' + (['success', 'error', 'info'].includes(type) ? type : 'info');
    el.textContent = message;
    container.appendChild(el);
    while (container.children.length > 5) container.firstElementChild.remove();
    setTimeout(() => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 250);
    }, timeout);
    return el;
  }
  window.toast = toast;

  // ---- Utilidades ----
  function escHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function fmtMs(ms) {
    if (!Number.isFinite(ms)) return '—';
    const total = Math.max(0, Math.round(ms));
    const s = Math.floor(total / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    const mmm = String(total % 1000).padStart(3, '0');
    return `${mm}:${ss},${mmm}`;
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, opts);
    let data = null;
    try { data = await res.json(); } catch (e) { /* sem corpo */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Erro ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function waitForBatchCompletion(projectName) {
    if (typeof window.waitForBatchCompletion !== 'function') {
      throw new Error('Acompanhamento do processamento indisponível. Recarregue a página.');
    }
    const progress = await window.waitForBatchCompletion(projectName);
    if (progress.status === 'CANCELLED') throw new Error('Processamento cancelado.');
    const data = await api(`/api/projects/${encodeURIComponent(projectName)}`);
    const manifest = data.project?.manifest || {};
    const cuts = manifest.cuts || [];
    const completed = cuts.filter((cut) => cut.status === 'CONCLUÍDO').length;
    const failed = cuts.filter((cut) => cut.status === 'ERRO').length;
    return {
      progress,
      manifest,
      results: { total: cuts.length, completed, failed, skipped: 0 },
    };
  }

  function showMessage(msg, type = 'success') {
    const el = $('#stage-message');
    if (el) {
      el.textContent = msg;
      el.className = 'stage-message ' + type;
      el.hidden = false;
    }
    toast(msg, type === 'error' ? 'error' : (type === 'info' ? 'info' : 'success'));
  }

  function hideMessage() {
    const el = $('#stage-message');
    if (el) el.hidden = true;
  }

  function setWorkflowStep(n) {
    $$('.workflow-step').forEach((step, i) => {
      step.classList.toggle('active', i + 1 === n);
      step.classList.toggle('done', i + 1 < n);
    });
  }

  function setTask(key, mod) {
    const t = $(`.task[data-task="${key}"]`);
    if (t) { t.classList.remove('running', 'done'); if (mod) t.classList.add(mod); }
  }

  // ---- Ações de transcrição (cancelar / refazer) ----
  function showTranscriptionActions({ cancelling = false, retry = false } = {}) {
    const row = $('#transcription-actions');
    if (!row) return;
    row.classList.toggle('hidden', !cancelling && !retry);
    const c = $('#cancel-transcription-btn');
    const r = $('#retry-transcription-btn');
    if (c) c.classList.toggle('hidden', !cancelling);
    if (r) r.classList.toggle('hidden', !retry);
  }

  // ---- Indicador de lote em processamento ----
  function setBatchRunning(running) {
    state.batchRunning = !!running;
    const stage = $('#cancel-batch-btn');
    const detail = $('#detail-cancel');
    if (stage) stage.classList.toggle('hidden', !state.batchRunning);
    if (detail) detail.hidden = !state.batchRunning;
  }
  window.setBatchRunning = setBatchRunning;

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  // ---- Navegação ----
  function setView(name) {
    $$('.view').forEach((v) => v.classList.remove('active'));
    const view = $('#view-' + name);
    if (view) view.classList.add('active');
    $$('.nav-item').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === name));
    window.scrollTo({ top: 0 });
  }

  const initialView = new URLSearchParams(location.search).get('view') || 'dashboard';
  const initialAnchor = new URLSearchParams(location.search).get('anchor');
  if ($('#view-' + initialView)) setView(initialView);
  if (initialAnchor) {
    const el = $('#' + initialAnchor);
    if (el) setTimeout(() => el.scrollIntoView({ behavior: 'instant', block: 'start' }), 60);
  }

  $$('.nav-item').forEach((btn) => {
    if (btn.dataset.anchor) {
      btn.addEventListener('click', () => {
        setView('dashboard');
        const el = $('#' + btn.dataset.anchor);
        if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
      });
    } else {
      btn.addEventListener('click', () => setView(btn.dataset.view));
    }
  });

  // ---- Sidebar mobile ----
  const sidebar = $('#sidebar');
  $('#menu-toggle').addEventListener('click', () => sidebar.classList.toggle('open'));
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 960 && !sidebar.contains(e.target) && !e.target.closest('#menu-toggle')) {
      sidebar.classList.remove('open');
    }
  });

  // ---- Health / sistema ----
  async function loadHealth() {
    const label = $('#system-status-text');
    const body = $('#health-body');
    label.textContent = 'VERIFICANDO…';
    if (body) {
      body.innerHTML = Array.from({ length: 5 }, () =>
        '<div class="skeleton" style="height:20px;margin:10px 0"></div>'
      ).join('');
    }
    try {
      const h = await api('/api/health');
      label.textContent = 'SISTEMA ONLINE';
      body.innerHTML = [
        ['Aplicação', h.app],
        ['Versão', h.version],
        ['FFmpeg', h.ffmpeg],
        ['FFprobe', h.ffprobe],
        ['Fonte GoBold', h.font],
      ].map(([k, v]) =>
        `<div class="health-row"><span>${escHtml(k)}</span><strong>${escHtml(v)}</strong></div>`
      ).join('');
    } catch (e) {
      label.textContent = 'OFFLINE';
      body.innerHTML = `<div class="empty-state">Sistema indisponível: ${escHtml(e.message)}</div>`;
    }
  }

  // ---- Configurações globais (personalização) ----
  async function loadSettings() {
    try {
      const data = await api('/api/settings');
      const s = data.settings || {};
      $('#settings-title-mode').value = s.titleMode || 'overlay';
      $('#settings-show-arroba').value = s.showArroba === false ? '0' : '1';
      renderArrobaPreview($('#settings-arroba-preview'), s.globalArrobaUrl || null);
    } catch (e) {
      showMessage('Erro ao carregar configurações: ' + e.message, 'error');
    }
  }

  $('#settings-save-btn').addEventListener('click', async () => {
    try {
      await api('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          titleMode: $('#settings-title-mode').value,
          showArroba: $('#settings-show-arroba').value === '1',
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      showMessage('Padrões globais salvos. Novos cortes/previews usarão estas opções.', 'success');
    } catch (e) {
      showMessage('Erro ao salvar padrões globais: ' + e.message, 'error');
    }
  });

  $('#settings-arroba-upload').addEventListener('click', async () => {
    const file = $('#settings-arroba-file').files[0];
    if (!file) return showMessage('Selecione um PNG para enviar.', 'error');
    const fd = new FormData();
    fd.append('image', file);
    try {
      await api('/api/settings/arroba', { method: 'POST', body: fd });
      showMessage('PNG global da arroba atualizado.', 'success');
      $('#settings-arroba-file').value = '';
      await loadSettings();
    } catch (e) {
      showMessage('Erro ao enviar PNG: ' + e.message, 'error');
    }
  });

  $('#settings-arroba-reset').addEventListener('click', async () => {
    try {
      await api('/api/settings/arroba', { method: 'DELETE' });
      showMessage('PNG global removido (voltou para a pasta arroba/).', 'success');
      await loadSettings();
    } catch (e) {
      showMessage('Erro ao resetar PNG: ' + e.message, 'error');
    }
  });

  // ---- Opções do projeto ----
  $('#proj-save-settings').addEventListener('click', async () => {
    const p = state.current;
    if (!p) return showMessage('Abra um projeto primeiro.', 'error');
    try {
      await api(`/api/projects/${encodeURIComponent(p.name)}/settings`, {
        method: 'PUT',
        body: JSON.stringify({
          titleMode: $('#proj-title-mode').value,
          showArroba: $('#proj-show-arroba').value === '1',
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      showMessage('Opções do projeto salvas. Clique em Preview para conferir.', 'success');
      await openProject(p.name);
    } catch (e) {
      showMessage('Erro ao salvar opções do projeto: ' + e.message, 'error');
    }
  });

  $('#proj-arroba-upload').addEventListener('click', async () => {
    const p = state.current;
    const file = $('#proj-arroba-file').files[0];
    if (!p || !file) return showMessage('Abra um projeto e selecione um PNG.', 'error');
    const fd = new FormData();
    fd.append('image', file);
    try {
      await api(`/api/projects/${encodeURIComponent(p.name)}/arroba`, { method: 'POST', body: fd });
      showMessage('PNG da arroba do projeto atualizado.', 'success');
      $('#proj-arroba-file').value = '';
      await openProject(p.name);
    } catch (e) {
      showMessage('Erro ao enviar PNG: ' + e.message, 'error');
    }
  });

  $('#proj-arroba-reset').addEventListener('click', async () => {
    const p = state.current;
    if (!p) return showMessage('Abra um projeto primeiro.', 'error');
    try {
      await api(`/api/projects/${encodeURIComponent(p.name)}/arroba`, { method: 'DELETE' });
      showMessage('Arroba do projeto removida (voltará a usar o padrão global).', 'success');
      await openProject(p.name);
    } catch (e) {
      showMessage('Erro ao remover arroba: ' + e.message, 'error');
    }
  });

  // ---- Etapa 1 — Importar vídeo ----
  const videoInput = $('#video');
  const videoNameEl = $('#video-name');

  videoInput.addEventListener('change', () => {
    const f = videoInput.files[0];
    videoNameEl.textContent = f ? f.name : 'Nenhum arquivo selecionado';
  });

  $('#upload-btn').addEventListener('click', async () => {
    const name = $('#project-name').value.trim();
    const file = videoInput.files[0];
    if (!name) return showMessage('Informe o nome do projeto.', 'error');
    if (!file) return showMessage('Selecione um vídeo para enviar.', 'error');

    hideMessage();
    setWorkflowStep(1);
    state.stage1 = 'UPLOADING';
    setTask('meta', 'running');
    $('#upload-tasks').classList.remove('hidden');
    $('#upload-btn').disabled = true;

    try {
      const fd = new FormData();
      fd.append('video', file);
      fd.append('name', name);

      const data = await api('/api/import', { method: 'POST', body: fd });
      setTask('meta', 'done');

      const projName = data.project.name;
      const mb = (file.size / 1024 / 1024).toFixed(1);
      state.transcribingProject = projName;

      const transcription = data.transcription || {};

      if (transcription.status === 'SRT_READY') {
        finishSrtReady(projName, mb, transcription.srtBlocks || 0);
      } else if (transcription.status === 'ERROR') {
        finishSrtError(projName, transcription.error || 'Erro desconhecido na transcrição.');
      } else {
        startPolling(projName, mb);
      }

      videoInput.value = '';
      videoNameEl.textContent = 'Nenhum arquivo selecionado';
      $('#project-name').value = '';
      $('.flow-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {
      state.stage1 = 'ERROR';
      setTask('meta', 'done');
      setTask('whisper', 'done');
      setTask('ready', 'done');
      showMessage('Erro ao importar: ' + e.message, 'error');
    } finally {
      $('#upload-btn').disabled = false;
    }
  });

  // ---- DOWNLOAD DO YOUTUBE ----
  const youtubeUrlInput = $('#youtube-url');
  const youtubeProjectNameInput = $('#youtube-project-name');
  const downloadYoutubeBtn = $('#download-youtube-btn');
  const youtubeStatusPanel = $('#youtube-status');
  const youtubeDownloadsList = $('#youtube-downloads-list');

  function updateYoutubeDownload(id, status, message) {
    const li = document.getElementById(`yt-download-${id}`);
    if (li) {
      li.className = 'download-item ' + (status === 'completed' ? 'done' : 'running');
      li.querySelector('.task-check').classList.toggle('hidden', status !== 'completed');
      li.querySelector('.message').textContent = message;
    }
  }

  function waitForYoutubeImport(name, id) {
    return new Promise((resolve, reject) => {
      let tries = 0;
      const poll = async () => {
        tries += 1;
        try {
          const status = await api(`/api/import/youtube/${encodeURIComponent(name)}/status`);
          const progress = status.progress || {};
          const transcription = status.transcription || null;

          if (progress.status === 'ERROR') {
            throw new Error(progress.message || 'Falha no download do YouTube.');
          }
          if (transcription?.status === 'ERROR') {
            throw new Error(transcription.error || 'Falha na transcrição do vídeo.');
          }
          if (transcription?.status === 'SRT_READY') {
            resolve(transcription);
            return;
          }

          if (progress.status === 'DOWNLOADING') {
            const percent = Number(progress.progress) || 0;
            updateYoutubeDownload(id, 'running', `Baixando vídeo… ${percent.toFixed(1)}%`);
          } else if (transcription?.status === 'TRANSCRIBING') {
            const percent = Number(transcription.progress?.progress) || 0;
            updateYoutubeDownload(id, 'running', `Gerando SRT… ${percent.toFixed(1)}%`);
          }

          if (tries >= 1200) throw new Error('Tempo limite do download/transcrição excedido.');
          setTimeout(poll, 3000);
        } catch (error) {
          reject(error);
        }
      };
      poll();
    });
  }

  downloadYoutubeBtn.addEventListener('click', async () => {
    const url = youtubeUrlInput.value.trim();
    const name = youtubeProjectNameInput.value.trim();

    if (!url) return showMessage('Informe o link do YouTube.', 'error');
    if (!name) return showMessage('Informe o nome do projeto.', 'error');

    // Validação básica de URL do YouTube
    const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/;
    if (!ytRegex.test(url)) {
      return showMessage('URL inválida. Use um link do YouTube.', 'error');
    }

    hideMessage();
    youtubeDownloadsList.classList.remove('hidden');
    downloadYoutubeBtn.disabled = true;

    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    const li = document.createElement('li');
    li.id = `yt-download-${id}`;
    li.className = 'download-item running';
    li.innerHTML = `
      <div class="task" data-task="${id}"><span class="task-check"></span><span>Baixando...</span></div>
      <div class="message">Iniciando download do YouTube</div>
    `;
    $('#youtube-downloads-ul').appendChild(li);

    try {
      const data = await api('/api/import/youtube', {
        method: 'POST',
        body: JSON.stringify({ url, name }),
        headers: { 'Content-Type': 'application/json' },
      });
      await waitForYoutubeImport(data.projectName || name, id);

      updateYoutubeDownload(id, 'completed', '✅ Vídeo baixado e SRT gerado!');
      youtubeStatusPanel.classList.add('hidden');
      showMessage(`Projeto "${name}" criado com sucesso!`, 'success');

      // Limpar inputs após download bem-sucedido
      setTimeout(() => {
        youtubeUrlInput.value = '';
        youtubeProjectNameInput.value = '';
        $('#download-youtube-btn').disabled = false;
      }, 2000);

    } catch (e) {
      updateYoutubeDownload(id, 'error', `❌ Erro: ${e.message}`);
      showMessage('Erro ao baixar do YouTube: ' + e.message, 'error');
      $('#download-youtube-btn').disabled = false;
    }
  });

  function finishSrtReady(projName, mb, srtBlocks) {
    setTask('whisper', 'done');
    setTask('ready', 'done');
    state.stage1 = 'SRT_READY';
    showTranscriptionActions({});
    setWorkflowStep(3);
    const blocksMsg = srtBlocks ? ` (${srtBlocks} blocos)` : '';
    const sizeNote = mb ? ` (${mb} MB)` : '';
    showMessage(`Projeto "${projName}" criado${sizeNote}. SRT completo pronto${blocksMsg}.`, 'success');
    refreshProjects();

    // Mostrar botão de salvar SRT quando o estado for SRT_READY e habilitado
    const downloadBtn = document.createElement('button');
    downloadBtn.id = 'srt-download-btn';
    downloadBtn.className = 'btn btn-primary btn-full';
    downloadBtn.type = 'button';
    downloadBtn.textContent = '[SALVAR SRT]';
    $('#stage1').appendChild(downloadBtn);

    downloadBtn.addEventListener('click', async () => {
      try {
        const r = await fetch(`/api/projects/${encodeURIComponent(projName)}/srt`);
        if (!r.ok) {
          throw new Error(r.status === 404 ? 'original.srt não encontrado' : 'Falha ao obter SRT');
        }

        // Ler conteúdo como ArrayBuffer para download direto
        const blob = await r.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'original.srt';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } catch (e) {
        showMessage('Erro ao baixar SRT: ' + e.message, 'error');
      }
    });

    // Mostrar o botão no DOM após criação
    setTimeout(() => {
      const btnEl = $('#srt-download-btn');
      if (btnEl && !btnEl.parentElement) {
        $('#stage1').appendChild(btnEl);
      }
    }, 0);
  }

  function finishSrtError(projName, message) {
    setTask('whisper', '');
    setTask('ready', '');
    state.stage1 = 'ERROR';
    state.transcribingProject = projName || state.transcribingProject;
    showTranscriptionActions({ retry: true });
    setWorkflowStep(2);
    showMessage(`Transcrição falhou: ${message}`, 'error');
    refreshProjects();
  }

  let pollTimer = null;
  let pollTries = 0;

  function startPolling(projName, mb) {
    setTask('whisper', 'running');
    state.stage1 = 'TRANSCRIBING';
    state.transcribingProject = projName;
    showTranscriptionActions({ cancelling: true });
    setWorkflowStep(2);

    if (pollTimer) clearInterval(pollTimer);
    pollTries = 0;

    pollTimer = setInterval(async () => {
      pollTries++;
      try {
        const r = await api(`/api/projects/${encodeURIComponent(projName)}/transcription`);
        const st = r.transcription && r.transcription.status;
        if (st === 'SRT_READY') {
          clearInterval(pollTimer);
          pollTimer = null;
          finishSrtReady(projName, mb, r.transcription.srtBlocks || 0);
        } else if (st === 'ERROR') {
          clearInterval(pollTimer);
          pollTimer = null;
          finishSrtError(projName, r.transcription.error || 'Erro desconhecido na transcrição.');
        }
      } catch {
        // Erro transitório — continuar polling
      }
      if (pollTries >= 1200) {
        clearInterval(pollTimer);
        pollTimer = null;
        state.stage1 = 'ERROR';
        showTranscriptionActions({ retry: true });
        showMessage('Tempo limite de transcrição excedido (1h). Verifique o Whisper.', 'error');
      }
    }, 3000);
  }

  // ---- Cancelar / refazer transcrição ----
  $('#cancel-transcription-btn').addEventListener('click', async () => {
    const name = state.transcribingProject;
    if (!name) return;
    try {
      await api(`/api/projects/${encodeURIComponent(name)}/transcription`, { method: 'DELETE' });
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      state.transcribingProject = null;
      showTranscriptionActions({});
      showMessage(`Transcrição de "${name}" cancelada.`, 'info');
      refreshProjects();
    } catch (e) {
      showMessage('Erro ao cancelar transcrição: ' + e.message, 'error');
    }
  });

  $('#retry-transcription-btn').addEventListener('click', async () => {
    const name = state.transcribingProject;
    if (!name) return;
    try {
      hideMessage();
      await api(`/api/projects/${encodeURIComponent(name)}/transcription`, { method: 'POST' });
      startPolling(name, null);
      showMessage('Refazendo transcrição…', 'info');
    } catch (e) {
      showMessage('Erro ao refazer transcrição: ' + e.message, 'error');
    }
  });

  $('#cancel-batch-btn').addEventListener('click', async () => {
    const name = cutProjectSelect && cutProjectSelect.value;
    if (!name) return;
    try {
      await api(`/api/projects/${encodeURIComponent(name)}/generate-all`, { method: 'DELETE' });
      setBatchRunning(false);
      showMessage('Cancelando processamento…', 'info');
    } catch (e) {
      showMessage('Erro ao cancelar processamento: ' + e.message, 'error');
    }
  });

  $('#detail-cancel').addEventListener('click', async () => {
    const p = state.current;
    if (!p) return;
    try {
      await api(`/api/projects/${encodeURIComponent(p.name)}/generate-all`, { method: 'DELETE' });
      setBatchRunning(false);
      showMessage('Cancelando processamento…', 'info');
    } catch (e) {
      showMessage('Erro ao cancelar processamento: ' + e.message, 'error');
    }
  });

  // ---- Etapa 2 — Importar cortes no projeto existente ----
  const cortesInput = $('#cortes');
  const cortesNameEl = $('#cortes-name');
  const processBtn = $('#process-btn');
  const cutsResult = $('#cuts-result');
  const cutProjectSelect = $('#cut-project-select');

  cortesInput.addEventListener('change', () => {
    const f = cortesInput.files[0];
    cortesNameEl.textContent = f ? f.name : 'Nenhum arquivo selecionado';
    processBtn.disabled = true;
    state.stage2 = 'IDLE';
    if (cutsResult) cutsResult.innerHTML = '';
  });

  if (cutProjectSelect) {
    cutProjectSelect.addEventListener('change', () => {
      state.stage2 = 'IDLE';
      processBtn.disabled = true;
      if (cutsResult) {
        cutsResult.classList.add('hidden');
        cutsResult.innerHTML = '';
      }
    });
  }

  // Preenche selects de projeto
  function fillProjectSelect() {
    const opts = state.projects.map((p) =>
      `<option value="${escHtml(p.name)}">${escHtml(p.title || p.name)}</option>`
    ).join('');
    $('#cut-project-select').innerHTML = opts || '<option value="">Nenhum projeto</option>';
    $('#export-project-select').innerHTML = opts || '<option value="">Nenhum projeto</option>';
  }

  async function refreshProjects() {
    requireSkeleton(true);
    try {
      const data = await api('/api/projects');
      state.projects = data.projects || [];
      fillProjectSelect();
      renderKpis(state.projects);
      renderRecentProjects();
      renderProjectsTable();
    } catch (e) {
      state.projects = [];
      renderKpis([]);
      renderRecentProjects();
      renderProjectsTable();
    } finally {
      requireSkeleton(false);
    }
  }

  // ---- Validação real no servidor (importação de cortes) ----
  $('#validate-btn').addEventListener('click', async () => {
    const pname = cutProjectSelect && cutProjectSelect.value;
    const file = cortesInput.files[0];
    if (!pname) return showMessage('Selecione o projeto de destino.', 'error');
    if (!file) return showMessage('Selecione um cortes.json para importar.', 'error');

    hideMessage();
    state.stage2 = 'VALIDATING';
    processBtn.disabled = true;

    try {
      const fd = new FormData();
      fd.append('cortes', file);
      const data = await api(`/api/projects/${encodeURIComponent(pname)}/cuts/import`, {
        method: 'POST',
        body: fd,
      });

      const summary = data.cuts || { total: 0, valid: 0, errors: [] };
      if (data.ok && summary.errors.length === 0) {
        state.stage2 = 'CUTS_READY';
        processBtn.disabled = false;
        showCutsResult(true, summary);
        showMessage(`${summary.valid} de ${summary.total} cortes importados e validados no servidor.`, 'success');
      } else {
        state.stage2 = 'ERROR';
        showCutsResult(false, summary);
        showMessage(`${summary.errors.length} erro(s) de validação no servidor.`, 'error');
      }
    } catch (e) {
      state.stage2 = 'ERROR';
      showMessage('Erro ao importar cortes: ' + e.message, 'error');
      if (cutsResult) {
        cutsResult.classList.remove('hidden');
        cutsResult.innerHTML = `<div class="summary" style="color:var(--red)">✕ Falha na importação</div>
          <div class="fine">${escHtml(e.message)}</div>`;
      }
    }
  });

  function showCutsResult(ok, summary) {
    if (!cutsResult) return;
    const total = summary.total || 0;
    const valid = summary.valid || 0;
    const errors = summary.errors || [];
    cutsResult.classList.remove('hidden');
    if (ok) {
      cutsResult.innerHTML = `<div class="summary">✓ ${valid} de ${total} cortes importados e validados no servidor</div>
        <div class="fine">Pronto para processar com FFmpeg.</div>`;
    } else {
      cutsResult.innerHTML = `<div class="summary" style="color:var(--red)">✕ ${errors.length} erro(s) de validação (${valid} de ${total} válidos)</div>
        <div class="fine">${errors.map(escHtml).join('<br>')}</div>`;
    }
  }

  // ---- Processar cortes com FFmpeg (generate-all, após importação válida) ----
  processBtn.addEventListener('click', async () => {
    const pname = cutProjectSelect && cutProjectSelect.value;
    if (!pname) return showMessage('Selecione o projeto.', 'error');
    if (state.stage2 !== 'CUTS_READY') {
      return showMessage('Importe e valide o cortes.json no servidor antes de processar.', 'error');
    }

    hideMessage();
    state.stage2 = 'PROCESSING';
    processBtn.disabled = true;
    setWorkflowStep(4);
    if (cutsResult) {
      cutsResult.classList.remove('hidden');
      cutsResult.innerHTML = '<div class="summary">Processando cortes com FFmpeg…</div><div class="fine">Isso pode levar alguns minutos.</div>';
    }

    try {
      await api(`/api/projects/${encodeURIComponent(pname)}/generate-all`, { method: 'POST' });
      setBatchRunning(true);
      const r = await waitForBatchCompletion(pname);
      setBatchRunning(false);
      if (r.results.failed) throw new Error(`${r.results.failed} corte(s) falharam durante o processamento.`);
      state.stage2 = 'COMPLETED';
      setWorkflowStep(4);
      if (cutsResult) {
        cutsResult.innerHTML = `<div class="summary">✓ ${r.results.completed} de ${r.results.total} corte(s) gerados</div>
          <div class="fine">${r.results.failed ? r.results.failed + ' com falha.' : 'Todos'}</div>`;
      }
      showMessage(`Processamento concluído: ${r.results.completed} de ${r.results.total} cortes.`, 'success');
      await refreshProjects();
    } catch (e) {
      setBatchRunning(false);
      state.stage2 = 'ERROR';
      showMessage('Falha ao processar: ' + e.message, 'error');
      if (cutsResult) {
        cutsResult.innerHTML = `<div class="summary" style="color:var(--red)">✕ Falha ao processar</div>
          <div class="fine">${escHtml(e.message)}</div>`;
      }
    } finally {
      setBatchRunning(false);
      processBtn.disabled = false;
    }
  });

  // ---- Tabela de projetos (dashboard e Projetos) ----
  function statusRank(p) {
    if (Number(p.errorCuts) > 0) return 0;
    if (p.transcribing) return 1;
    if (Number(p.totalCuts) > 0 && Number(p.completedCuts) === Number(p.totalCuts)) return 2;
    if (Number(p.totalCuts) > 0) return 3;
    if (p.sourceSrt) return 4;
    return 5;
  }

  function projectStatusBadge(p) {
    const err = Number(p.errorCuts) || 0;
    const done = Number(p.completedCuts) || 0;
    const total = Number(p.totalCuts) || 0;
    if (p.transcribing) return '<span class="status-badge accent">Transcrevendo</span>';
    if (err > 0) return `<span class="status-badge bad">${err} corte(s) com erro</span>`;
    if (total > 0 && done === total) return '<span class="status-badge ok">Concluído</span>';
    if (total > 0) return `<span class="status-badge pending">${done}/${total} prontos</span>`;
    if (p.sourceSrt) return '<span class="status-badge accent">SRT pronto</span>';
    return '<span class="status-badge muted">Importado</span>';
  }

  function rowHtml(p) {
    const n = Number(p.totalCuts) || Number(p.cutCount) || 0;
    const cutBadge = n === 0
      ? '<span class="status-badge muted">Sem cortes</span>'
      : `<span class="status-badge ok num">${n} corte${n === 1 ? '' : 's'}</span>`;
    const date = fmtDate(p.importedAt);
    return `<tr>
      <td><strong>${escHtml(p.title || p.name)}</strong><div class="mono">${escHtml(p.name)}${date ? ` · ${date}` : ''}</div></td>
      <td>${projectStatusBadge(p)}</td>
      <td class="mono">✔</td>
      <td class="mono">${p.sourceSrt ? '✔' : '—'}</td>
      <td>${cutBadge}</td>
      <td class="actions">
        <button class="btn btn-secondary" data-open="${escHtml(p.name)}" type="button">Ver corte</button>
        <button class="btn btn-primary" data-export="${escHtml(p.name)}" type="button">Exportar</button>
      </td>
    </tr>`;
  }

  function visibleProjects() {
    const q = state.query.trim().toLowerCase();
    const filtered = state.projects.filter((p) => {
      if (!q) return true;
      const hay = `${p.name || ''} ${p.title || ''}`.toLowerCase();
      return hay.includes(q);
    });
    const key = state.sortKey;
    const dir = state.sortDir;
    return filtered.sort((a, b) => {
      let av; let bv;
      if (key === 'importedAt') { av = a.importedAt ? new Date(a.importedAt).getTime() : -1; bv = b.importedAt ? new Date(b.importedAt).getTime() : -1; }
      else if (key === 'status') { av = statusRank(a); bv = statusRank(b); }
      else { av = a[key] ?? ''; bv = b[key] ?? ''; }
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), 'pt-BR') * dir;
    });
  }

  function renderKpis(projects) {
    const set = (id, val) => { const el = $(id); if (el) el.textContent = String(val); };
    set('#kpi-projects', projects.length);
    set('#kpi-completed', projects.reduce((s, p) => s + (Number(p.completedCuts) || 0), 0));
    set('#kpi-pending', projects.reduce((s, p) => s + (Number(p.pendingCuts) || 0), 0));
    set('#kpi-errors', projects.reduce((s, p) => s + (Number(p.errorCuts) || 0), 0));
    const sub = $('#kpi-errors-sub');
    if (sub) sub.textContent = projects.length === 0 ? 'Nenhum projeto ainda' : '';
  }

  function renderRecentProjects() {
    const tbody = $('#recent-tbody');
    const wrap = $('#recent-table-wrap');
    const empty = $('#recent-empty');
    const list = state.projects.slice(0, 5);
    if (!list.length) {
      wrap.classList.add('hidden');
      empty.hidden = false;
      return;
    }
    wrap.classList.remove('hidden');
    empty.hidden = true;
    tbody.innerHTML = list.map(rowHtml).join('');
  }

  function renderProjectsTable() {
    const tbody = $('#projects-tbody');
    const wrap = $('#projects-table-wrap');
    const empty = $('#projects-empty');
    if (!state.projects.length) {
      wrap.classList.add('hidden');
      empty.hidden = false;
      const count = $('#projects-count');
      if (count) count.textContent = '';
      return;
    }
    wrap.classList.remove('hidden');
    empty.hidden = true;
    const list = visibleProjects();
    tbody.innerHTML = list.map(rowHtml).join('');
    const count = $('#projects-count');
    if (count) count.textContent = `${list.length} de ${state.projects.length} projeto(s)`;
  }

  function skeletonRows(rows) {
    return Array.from({ length: rows }, () =>
      `<tr class="skeleton-table"><td colspan="6"><span class="skeleton skeleton-row"></span></td></tr>`
    ).join('');
  }

  function requireSkeleton(on) {
    const tbody = $('#projects-tbody');
    const wrap = $('#projects-table-wrap');
    if (!tbody || !wrap) return;
    if (on) {
      wrap.classList.remove('hidden');
      $('#projects-empty').hidden = true;
      tbody.innerHTML = skeletonRows(4);
    }
  }

  // ---- Detalhe do projeto ----
  async function openProject(name) {
    try {
      const data = await api(`/api/projects/${encodeURIComponent(name)}`);
      state.current = data.project;
      $('#detail-title').textContent = state.current.title || state.current.name;
      const cuts = (state.current.manifest && state.current.manifest.cuts) || [];
      const dur = state.current.manifest ? state.current.manifest.videoDurationMs : null;
      $('#detail-sub').textContent = `${cuts.length} corte(s) · duração ${fmtMs(dur)}`;
      $('#detail-card').classList.remove('hidden');
      $('#detail-generate-all').disabled = cuts.length === 0;
      $('#detail-export').disabled = cuts.length === 0;
      renderCutTable(cuts);
      renderValidationErrors(state.current.manifest);
      populateProjectOptions();
      setView('projects');
    } catch (e) {
      showMessage('Erro ao abrir projeto: ' + e.message, 'error');
    }
  }

  function populateProjectOptions() {
    const p = state.current;
    if (!p) return;
    const settings = (p.manifest && p.manifest.settings) || {};
    $('#proj-title-mode').value = settings.titleMode || 'overlay';
    $('#proj-show-arroba').value = settings.showArroba === false ? '0' : '1';
    renderArrobaPreview($('#proj-arroba-preview'), p.customArrobaUrl);
  }

  function renderArrobaPreview(img, url) {
    if (!img) return;
    if (url) {
      img.src = url;
      img.classList.remove('hidden');
    } else {
      img.classList.add('hidden');
      img.removeAttribute('src');
    }
  }

  function renderCutTable(cuts) {
    const tbody = $('#cut-tbody');
    const wrap = $('#cut-table-wrap');
    if (!cuts.length) {
      wrap.classList.add('hidden');
      tbody.innerHTML = '';
      return;
    }
    wrap.classList.remove('hidden');
    const p = state.current;
    const projSettings = (p && p.manifest && p.manifest.settings) || {};

    const eff = (c, key) => {
      const cutOpts = c.options || {};
      if (key === 'titleMode') return cutOpts.titleMode || projSettings.titleMode || 'overlay';
      const cutVal = cutOpts.showArroba !== undefined ? cutOpts.showArroba : projSettings.showArroba;
      return cutVal !== undefined ? cutVal !== false : true;
    };

    const titleSel = (c) =>
      `<select class="input cut-title-mode" data-id="${c.id}">
        <option value="overlay" ${eff(c, 'titleMode') === 'overlay' ? 'selected' : ''}>Sobrepor</option>
        <option value="filename" ${eff(c, 'titleMode') === 'filename' ? 'selected' : ''}>Só no arquivo</option>
        <option value="hidden" ${eff(c, 'titleMode') === 'hidden' ? 'selected' : ''}>Ocultar</option>
      </select>`;
    const arrobaSel = (c) =>
      `<select class="input cut-show-arroba" data-id="${c.id}">
        <option value="1" ${eff(c, 'showArroba') ? 'selected' : ''}>Mostrar</option>
        <option value="0" ${!eff(c, 'showArroba') ? 'selected' : ''}>Ocultar</option>
      </select>`;

    tbody.innerHTML = cuts.map((c, i) => {
      const st = String(c.status || 'PENDENTE').toUpperCase();
      const cls = ['CONCLUÍDO', 'CONCLUIDO', 'PRONTO', 'OK'].includes(st) ? 'ok' : 'pending';
      return `<tr>
        <td class="mono">${i + 1}</td>
        <td>${escHtml(c.theme || '—')}</td>
        <td>${escHtml(c.title || '—')}</td>
        <td class="mono">${fmtMs(c.startMs)} → ${fmtMs(c.endMs)}</td>
        <td>${titleSel(c)}</td>
        <td>${arrobaSel(c)}</td>
        <td><span class="status-badge ${cls}">${escHtml(st)}</span></td>
        <td class="actions">
          <button class="btn btn-secondary" data-preview="${escHtml(c.id)}" type="button">Preview</button>
          <button class="btn btn-primary" data-gen="${escHtml(c.id)}" type="button">Gerar</button>
        </td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-preview]').forEach((b) =>
      b.addEventListener('click', () => previewCut(b.dataset.preview)));
    tbody.querySelectorAll('[data-gen]').forEach((b) =>
      b.addEventListener('click', () => generateCut(b.dataset.gen)));
    tbody.querySelectorAll('.cut-title-mode').forEach((sel) =>
      sel.addEventListener('change', () => setCutOption(sel.dataset.id, { titleMode: sel.value })));
    tbody.querySelectorAll('.cut-show-arroba').forEach((sel) =>
      sel.addEventListener('change', () => setCutOption(sel.dataset.id, { showArroba: sel.value === '1' })));
  }

  async function setCutOption(cutId, patch) {
    const p = state.current;
    if (!p) return;
    try {
      await api(`/api/projects/${encodeURIComponent(p.name)}/cuts/${encodeURIComponent(cutId)}/options`, {
        method: 'PUT',
        body: JSON.stringify(patch),
        headers: { 'Content-Type': 'application/json' },
      });
      showMessage(`Opções do corte ${cutId} salvas. Clique em Preview para conferir.`, 'success');
    } catch (e) {
      showMessage('Erro ao salvar opções do corte: ' + e.message, 'error');
    }
    await openProject(p.name);
  }

  function renderValidationErrors(manifest) {
    const el = $('#error-list');
    const errs = (manifest && manifest.validationErrors) || [];
    el.innerHTML = errs.length
      ? errs.map((e) => `<div class="error-item">${escHtml(typeof e === 'string' ? e : JSON.stringify(e))}</div>`).join('')
      : '';
  }

  $('#detail-back').addEventListener('click', () => {
    $('#detail-card').classList.add('hidden');
    setView('projects');
  });

  async function generateCut(cutId) {
    const p = state.current;
    if (!p) return;
    try {
      const r = await api(`/api/projects/${encodeURIComponent(p.name)}/cuts/${encodeURIComponent(cutId)}/generate`, { method: 'POST' });
      showMessage(`Corte "${cutId}" gerado com sucesso.`, 'success');
      await openProject(p.name);
    } catch (e) {
      showMessage('Erro ao gerar corte: ' + e.message, 'error');
    }
  }

  $('#detail-generate-all').addEventListener('click', async () => {
    const p = state.current;
    if (!p) return;
    try {
      await api(`/api/projects/${encodeURIComponent(p.name)}/generate-all`, { method: 'POST' });
      setBatchRunning(true);
      const r = await waitForBatchCompletion(p.name);
      setBatchRunning(false);
      if (r.results.failed) {
        throw new Error(`${r.results.failed} corte(s) falharam durante o processamento.`);
      }
      showMessage(`Gerados: ${r.results.completed} de ${r.results.total} cortes.`, 'success');
      await openProject(p.name);
    } catch (e) {
      setBatchRunning(false);
      showMessage('Erro ao gerar cortes: ' + e.message, 'error');
    }
  });

  async function previewCut(cutId) {
    const p = state.current;
    if (!p) return;
    try {
      const r = await api(`/api/projects/${encodeURIComponent(p.name)}/cuts/${encodeURIComponent(cutId)}/preview`);
      if (r.ok && r.preview && r.preview.url) {
        $('#preview-video').src = r.preview.url;
        $('#preview-modal').classList.remove('hidden');
        return;
      }
    } catch (e) { /* segue para fallback */ }
    showMessage('Preview indisponível até o corte ser gerado.', 'error');
  }

  $('#preview-close').addEventListener('click', closePreview);
  $('#preview-modal').addEventListener('click', (e) => {
    if (e.target.id === 'preview-modal') closePreview();
  });
  function closePreview() {
    const v = $('#preview-video');
    v.pause();
    v.removeAttribute('src');
    $('#preview-modal').classList.add('hidden');
  }

  // ---- Delegação de cliques nas tabelas ----
  document.addEventListener('click', (e) => {
    const open = e.target.closest('[data-open]');
    if (open) { openProject(open.dataset.open); return; }
    const exp = e.target.closest('[data-export]');
    if (exp) { $('#export-project-select').value = exp.dataset.export; exportZip(); return; }
  });

  // ---- Exportações ----
  $('#export-btn').addEventListener('click', exportZip);

  async function exportZip() {
    const name = $('#export-project-select').value;
    if (!name) return showMessage('Selecione um projeto para exportar.', 'error');
    const box = $('#export-result');
    box.classList.remove('hidden');
    box.innerHTML = '<div class="summary">Gerando ZIP…</div>';
    try {
      const r = await api(`/api/projects/${encodeURIComponent(name)}/export`, { method: 'POST' });
      if (!r.ok) throw new Error(r.error || 'Falha ao exportar.');
      box.innerHTML = `<div class="summary">✓ ZIP gerado (${r.completed} cortes)</div>
        <div class="fine"><a href="${escHtml(r.url)}" download>${escHtml(r.zipName)}</a></div>`;
      showMessage('Exportação concluída.', 'success');
    } catch (e) {
      box.innerHTML = `<div class="summary" style="color:var(--red)">✕ ${escHtml(e.message)}</div>`;
    }
  }

  // ---- Busca, ordenação e densidade ----
  const searchInput = $('#project-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.query = e.target.value;
      renderProjectsTable();
    });
  }

  try {
    if (localStorage.getItem('rells-density') === 'compact') {
      document.body.classList.add('compact');
    }
  } catch { /* sem persistência */ }

  if (document.body.classList.contains('compact')) {
    $('#density-toggle').textContent = 'ESPAÇAR';
  }

  $('#density-toggle').addEventListener('click', () => {
    const on = document.body.classList.toggle('compact');
    $('#density-toggle').textContent = on ? 'ESPAÇAR' : 'COMPACTAR';
    try { localStorage.setItem('rells-density', on ? 'compact' : 'normal'); } catch { /* sem persistência */ }
  });

  const sortThs = $$('#projects-table th[data-sort]');
  sortThs.forEach((th) => {
    const key = th.dataset.sort;
    const click = () => {
      if (state.sortKey === key) state.sortDir *= -1;
      else { state.sortKey = key; state.sortDir = (key === 'importedAt') ? -1 : 1; }
      sortThs.forEach((t) => t.removeAttribute('data-dir'));
      th.setAttribute('data-dir', state.sortDir === 1 ? 'asc' : 'desc');
      renderProjectsTable();
    };
    th.addEventListener('click', click);
    th.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); click(); }
    });
  });

  // ---- Sidebar colapsável (desktop) ----
  $('#collapse-btn').addEventListener('click', () => {
    document.querySelector('.layout').classList.toggle('collapsed');
  });

  // ---- Atalhos de teclado ----
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '/') {
      e.preventDefault();
      const s = $('#project-search');
      if (s) s.focus();
    } else if (/^[1-4]$/.test(e.key)) {
      const views = ['dashboard', 'projects', 'exports', 'settings'];
      setView(views[Number(e.key) - 1]);
    }
  });

  // ---- Init ----
  (async function init() {
    hideMessage();
    showTranscriptionActions({});
    setBatchRunning(false);
    loadHealth();
    await refreshProjects();
    loadSettings();
    setWorkflowStep(1);
  })();
})();