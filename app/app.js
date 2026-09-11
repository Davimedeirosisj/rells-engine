const viewImport = document.getElementById('view-import');
const viewDashboard = document.getElementById('view-dashboard');
const navImport = document.getElementById('nav-import');
const navProjects = document.getElementById('nav-projects');
const dashboardSummary = document.getElementById('dashboard-summary');
const cutTableWrap = document.getElementById('cut-table-wrap');
const cutTbody = document.getElementById('cut-tbody');
const errorList = document.getElementById('error-list');
const generateAllBtn = document.getElementById('generate-all-btn');
const exportBtn = document.getElementById('export-btn');

const videoInput = document.getElementById('video');
const srtInput = document.getElementById('srt');
const cortesInput = document.getElementById('cortes');
const importBtn = document.getElementById('import-btn');
const message = document.getElementById('message');

let currentProject = null;

function bindName(inputId, hintId) {
  const input = document.getElementById(inputId);
  const hint = document.getElementById(hintId);
  input.addEventListener('change', () => {
    hint.textContent = input.files[0]?.name || 'Nenhum arquivo selecionado';
  });
}

bindName('video', 'video-name');
bindName('srt', 'srt-name');
bindName('cortes', 'cortes-name');

function showMessage(msg, type) {
  message.hidden = false;
  message.textContent = msg;
  message.className = 'message ' + type;
}

function switchView(view) {
  const isImport = view === 'import';
  viewImport.hidden = !isImport;
  viewDashboard.hidden = isImport;
  navImport.classList.toggle('active', isImport);
  navProjects.classList.toggle('active', !isImport);
  if (!isImport) {
    loadProjects();
  }
}

navImport.addEventListener('click', () => switchView('import'));
navProjects.addEventListener('click', () => switchView('projects'));

importBtn.addEventListener('click', async () => {
  if (!videoInput.files[0] || !srtInput.files[0] || !cortesInput.files[0]) {
    showMessage('Selecione os três arquivos: vídeo, SRT e cortes.json.', 'err');
    return;
  }

  const form = new FormData();
  form.append('video', videoInput.files[0]);
  form.append('srt', srtInput.files[0]);
  form.append('cortes', cortesInput.files[0]);

  importBtn.disabled = true;
  importBtn.textContent = 'IMPORTANDO...';
  message.hidden = true;

  try {
    const res = await fetch('/api/import', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      showMessage(data.error || 'Erro ao importar projeto.', 'err');
      return;
    }
    currentProject = data.project;
    switchView('projects');
  } catch (err) {
    showMessage('Não foi possível conectar ao servidor local.', 'err');
  } finally {
    importBtn.disabled = false;
    importBtn.textContent = 'IMPORTAR PROJETO';
  }
});

async function loadProjects() {
  let data;
  try {
    const res = await fetch('/api/projects');
    data = await res.json();
  } catch (err) {
    dashboardSummary.innerHTML = '<div class="panel"><h2>Projetos</h2><p class="empty">Não foi possível conectar ao servidor local.</p></div>';
    cutTableWrap.hidden = true;
    errorList.innerHTML = '';
    generateAllBtn.hidden = true;
    exportBtn.hidden = true;
    return;
  }

  if (!data.ok || data.projects.length === 0) {
    dashboardSummary.innerHTML = '';
    errorList.innerHTML = '';
    cutTableWrap.hidden = true;
    generateAllBtn.hidden = true;
    dashboardSummary.innerHTML = '<div class="panel"><h2>Projetos</h2><p class="empty">Nenhum projeto importado ainda.</p></div>';
    return;
  }

  dashboardSummary.innerHTML = `
    <div class="panel">
      <h2>Projetos</h2>
      <div class="projects-list">
        ${data.projects.map((p) => `
          <div class="project-card" data-name="${escapeHtml(p.name)}">
            <div>
              <div class="p-name">${escapeHtml(p.title)}</div>
              <div class="p-meta">${p.cutCount} corte(s) válido(s) · ${p.totalCuts} total</div>
            </div>
          </div>`).join('')}
      </div>
    </div>`;

  cutTableWrap.hidden = true;
  errorList.innerHTML = '';
  generateAllBtn.hidden = true;

  dashboardSummary.querySelectorAll('.project-card').forEach((card) => {
    card.addEventListener('click', () => openProject(card.dataset.name));
  });

  if (currentProject && data.projects.some((p) => p.name === currentProject.name)) {
    openProject(currentProject.name);
  }
}

async function openProject(name) {
  const res = await fetch('/api/projects/' + encodeURIComponent(name));
  const data = await res.json();
  if (!data.ok) {
    return;
  }

  const p = data.project;
  const m = p.manifest;
  currentProject = { name: p.name };
  document.title = `${m.project || p.name} · RELLS ENGINE`;

  const cuts = m.cuts || [];
  const total = cuts.length + (m.validationErrors || []).length;
  const done = cuts.filter((c) => c.status === 'CONCLUÍDO').length;
  const failed = cuts.filter((c) => c.status === 'ERRO').length;
  const pct = cuts.length > 0 ? Math.round((done / cuts.length) * 100) : 0;

  dashboardSummary.innerHTML = `
    <div class="panel">
      <div class="back-row"><button class="link-btn" id="back-btn" type="button">← Voltar</button></div>
      <div class="flx-between">
        <h2>${escapeHtml(m.project || p.name)}</h2>
        <span class="chip chip-muted">${cuts.length} corte(s) válido(s)</span>
      </div>
      <p class="p-sub">${total} total · duração ${msToClock(m.videoDurationMs)}</p>
      ${cuts.length > 0 ? `
        <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
          <div class="progress-bar" style="width:${pct}%"></div>
        </div>
        <p class="progress-label">${done} concluído(s) ${failed ? '· ' + failed + ' erro(s)' : ''} · ${pct}%</p>` : ''}
    </div>`;

  document.getElementById('back-btn').addEventListener('click', () => {
    currentProject = null;
    switchView('projects');
  });

  renderCuts(cuts);
  renderErrors(m.validationErrors || []);

  generateAllBtn.hidden = !(cuts.length > 0);
  exportBtn.hidden = !cuts.some((c) => c.status === 'CONCLUÍDO');
}

function renderCuts(cuts) {
  if (cuts.length === 0) {
    cutTableWrap.hidden = true;
    return;
  }
  cutTableWrap.hidden = false;
  cutTbody.innerHTML = cuts.map((c, i) => {
    const dur = (c.endMs != null && c.startMs != null) ? msToClock(c.endMs - c.startMs) : '';
    const status = c.status || 'PENDENTE';
    return `
    <tr data-id="${c.id}">
      <td>${escapeHtml(String(c.id))}</td>
      <td class="theme" title="${escapeHtml(c.theme || '')}">${escapeHtml(c.theme)}</td>
      <td class="title" title="${escapeHtml(c.title || '')}">${escapeHtml(c.title)}</td>
      <td class="time">${escapeHtml(c.start)} → ${escapeHtml(c.end)}${dur ? `<br><span class="dur">${dur}</span>` : ''}</td>
      <td>
        <span class="status ${escapeHtml(status)}" ${c.error ? `title="${escapeHtml(c.error)}"` : ''}>${escapeHtml(status)}</span>
        ${c.error ? `<span class="err-hint">${escapeHtml(shortError(c.error))}</span>` : ''}
      </td>
      <td>
        <div class="row-actions">
          <button type="button" data-act="preview">Visualizar</button>
          ${c.status === 'CONCLUÍDO'
            ? `<a class="row-link" href="/media/${encodeURIComponent(currentProject.name)}/output/${encodeURIComponent(c.output)}" download title="Baixar MP4">Baixar</a>`
            : ''}
          <button type="button" data-act="edit">Editar</button>
          ${c.status === 'ERRO'
            ? `<button type="button" data-act="retry" class="retry">Tentar Novamente</button>`
            : c.status === 'CONCLUÍDO'
              ? `<button type="button" data-act="generate">Regenerar</button>`
              : `<button type="button" data-act="generate">Gerar</button>`
          }
          <button type="button" data-act="remove">Remover</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  cutTbody.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => handleAction(btn));
  });
}

function shortError(msg) {
  const s = String(msg || '');
  return s.length > 70 ? s.slice(0, 70) + '…' : s;
}

async function handleAction(btn) {
  const row = btn.closest('tr');
  const cutId = Number(row.dataset.id);
  const act = btn.dataset.act;

  if (act === 'generate' || act === 'retry') {
    await generateCut(currentProject.name, cutId, btn);
  } else if (act === 'preview') {
    await previewCut(currentProject.name, cutId, btn);
  } else if (act === 'edit' || act === 'remove') {
    showMessage(`Ação "${act}" será implementada em uma fase futura.`, 'err');
  }
}

async function previewCut(projectName, cutId, btn) {
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Preparando...';

  try {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectName)}/cuts/${cutId}/preview`,
      { method: 'POST' },
    );
    const data = await res.json();
    if (!res.ok || !data.ok) {
      showMessage(data.error || 'Falha ao gerar preview.', 'err');
      return;
    }
    openPreview(data.preview.url);
  } catch (err) {
    showMessage('Não foi possível conectar ao servidor local.', 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

function openPreview(url) {
  const modal = document.getElementById('preview-modal');
  const video = document.getElementById('preview-video');
  modal.hidden = false;
  video.src = url;
  video.play().catch(() => {});
}

function closePreview() {
  const modal = document.getElementById('preview-modal');
  const video = document.getElementById('preview-video');
  modal.hidden = true;
  video.pause();
  video.removeAttribute('src');
  video.load();
}

document.getElementById('preview-close').addEventListener('click', closePreview);
document.getElementById('preview-modal').addEventListener('click', (e) => {
  if (e.target.id === 'preview-modal') closePreview();
});

async function generateCut(projectName, cutId, btn) {
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Gerando...';

  try {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectName)}/cuts/${cutId}/generate`,
      { method: 'POST' },
    );
    const data = await res.json();
    if (!res.ok || !data.ok) {
      showMessage(data.error || 'Falha ao gerar corte.', 'err');
      return;
    }
    await openProject(projectName);
  } catch (err) {
    showMessage('Não foi possível conectar ao servidor local.', 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

function renderErrors(errors) {
  if (!errors || errors.length === 0) {
    errorList.innerHTML = '';
    return;
  }
  errorList.innerHTML = `<div class="panel"><h2>Cortes inválidos</h2>` +
    errors.map((e) => `<div class="err-box">${escapeHtml(e)}</div>`).join('') +
    `</div>`;
}

function msToClock(ms) {
  if (!ms && ms !== 0) return '—';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

generateAllBtn.addEventListener('click', () => generateAll(currentProject?.name));

async function generateAll(projectName) {
  if (!projectName) return;

  generateAllBtn.disabled = true;
  generateAllBtn.textContent = 'PROCESSANDO...';

  try {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(projectName)}/generate-all`,
      { method: 'POST' },
    );
    const data = await res.json();
    if (!res.ok || !data.ok) {
      showMessage(data.error || 'Falha no processamento em lote.', 'err');
      return;
    }
    const r = data.results;
    showMessage(
      `Lote concluído: ${r.completed} concluído(s), ${r.failed} erro(s), ${r.skipped} ignorado(s).`,
      r.failed > 0 ? 'err' : 'ok',
    );
    await openProject(projectName);
  } catch (err) {
    showMessage('Não foi possível conectar ao servidor local.', 'err');
  } finally {
    generateAllBtn.disabled = false;
    generateAllBtn.textContent = 'GERAR TODOS OS CORTES';
  }
}

exportBtn.addEventListener('click', () => exportProject(currentProject?.name));

async function exportProject(projectName) {
  if (!projectName) return;

  exportBtn.disabled = true;
  const original = exportBtn.textContent;
  exportBtn.textContent = 'EXPORTANDO...';

  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(projectName)}/export`, {
      method: 'POST',
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      showMessage(data.error || 'Falha na exportação.', 'err');
      return;
    }
    showMessage(
      `ZIP gerado com ${data.completed} corte(s) concluído(s). Iniciando download...`,
      'ok',
    );
    window.location.href = data.url;
  } catch (err) {
    showMessage('Não foi possível conectar ao servidor local.', 'err');
  } finally {
    exportBtn.disabled = false;
    exportBtn.textContent = original;
  }
}

switchView('projects');