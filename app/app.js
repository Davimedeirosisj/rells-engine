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
  };

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

  function showMessage(msg, type = 'success') {
    const el = $('#stage-message');
    if (!el) return;
    el.textContent = msg;
    el.className = 'stage-message ' + type;
    el.hidden = false;
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

  // ---- Navegação ----
  function setView(name) {
    $$('.view').forEach((v) => v.classList.remove('active'));
    const view = $('#view-' + name);
    if (view) view.classList.add('active');
    $$('.nav-item').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === name));
    window.scrollTo({ top: 0 });
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

      const transcription = data.transcription || {};

      if (transcription.status === 'SRT_READY') {
        finishSrtReady(projName, mb, transcription.srtBlocks || 0);
      } else if (transcription.status === 'ERROR') {
        finishSrtError(transcription.error || 'Erro desconhecido na transcrição.');
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

  function finishSrtReady(projName, mb, srtBlocks) {
    setTask('whisper', 'done');
    setTask('ready', 'done');
    state.stage1 = 'SRT_READY';
    setWorkflowStep(3);
    const blocksMsg = srtBlocks ? ` (${srtBlocks} blocos)` : '';
    showMessage(`Projeto "${projName}" criado (${mb} MB). SRT completo pronto${blocksMsg}.`, 'success');
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

  function finishSrtError(message) {
    setTask('whisper', '');
    setTask('ready', '');
    state.stage1 = 'ERROR';
    setWorkflowStep(2);
    showMessage(`Transcrição falhou: ${message}`, 'error');
    refreshProjects();
  }

  let pollTimer = null;
  let pollTries = 0;

  function startPolling(projName, mb) {
    setTask('whisper', 'running');
    state.stage1 = 'TRANSCRIBING';
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
          finishSrtError(r.transcription.error || 'Erro desconhecido na transcrição.');
        }
      } catch {
        // Erro transitório — continuar polling
      }
      if (pollTries >= 1200) {
        clearInterval(pollTimer);
        pollTimer = null;
        state.stage1 = 'ERROR';
        showMessage('Tempo limite de transcrição excedido (1h). Verifique o Whisper.', 'error');
      }
    }, 3000);
  }

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
    try {
      const data = await api('/api/projects');
      state.projects = data.projects || [];
      fillProjectSelect();
      renderRecentProjects();
      renderProjectsTable();
    } catch (e) {
      state.projects = [];
      renderRecentProjects();
      renderProjectsTable();
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
      const r = await api(`/api/projects/${encodeURIComponent(pname)}/generate-all`, { method: 'POST' });
      if (!r.ok) throw new Error(r.error || 'Falha ao processar.');
      state.stage2 = 'COMPLETED';
      setWorkflowStep(4);
      if (cutsResult) {
        cutsResult.innerHTML = `<div class="summary">✓ ${r.results.completed} de ${r.results.total} corte(s) gerados</div>
          <div class="fine">${r.results.failed ? r.results.failed + ' com falha.' : 'Todos'}</div>`;
      }
      showMessage(`Processamento concluído: ${r.results.completed} de ${r.results.total} cortes.`, 'success');
      await refreshProjects();
    } catch (e) {
      state.stage2 = 'ERROR';
      showMessage('Falha ao processar: ' + e.message, 'error');
      if (cutsResult) {
        cutsResult.innerHTML = `<div class="summary" style="color:var(--red)">✕ Falha ao processar</div>
          <div class="fine">${escHtml(e.message)}</div>`;
      }
    } finally {
      processBtn.disabled = false;
    }
  });

  // ---- Tabela de projetos (dashboard e Projetos) ----
  function rowHtml(p) {
    const n = Number(p.totalCuts) || Number(p.cutCount) || 0;
    const cutBadge = n === 0
      ? '<span class="status-badge muted">Sem cortes</span>'
      : `<span class="status-badge ok">${n} corte${n === 1 ? '' : 's'}</span>`;
    return `<tr>
      <td><strong>${escHtml(p.title || p.name)}</strong><div class="mono">${escHtml(p.name)}</div></td>
      <td><span class="status-badge ok">Importado</span></td>
      <td class="mono">✔</td>
      <td class="mono">${p.sourceSrt ? '✔' : '—'}</td>
      <td>${cutBadge}</td>
      <td class="actions">
        <button class="btn btn-secondary" data-open="${escHtml(p.name)}" type="button">Ver corte</button>
        <button class="btn btn-primary" data-export="${escHtml(p.name)}" type="button">Exportar</button>
      </td>
    </tr>`;
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
      return;
    }
    wrap.classList.remove('hidden');
    empty.hidden = true;
    tbody.innerHTML = state.projects.map(rowHtml).join('');
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
      const r = await api(`/api/projects/${encodeURIComponent(p.name)}/generate-all`, { method: 'POST' });
      showMessage(`Gerados: ${r.results.completed} de ${r.results.total} cortes.`, 'success');
      await openProject(p.name);
    } catch (e) {
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

  // ---- Init ----
  (async function init() {
    hideMessage();
    loadHealth();
    await refreshProjects();
    loadSettings();
    setWorkflowStep(1);
  })();
})();