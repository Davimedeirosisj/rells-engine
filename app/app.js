const viewImport = document.getElementById('view-import');
const viewDashboard = document.getElementById('view-dashboard');
const navImport = document.getElementById('nav-import');
const navProjects = document.getElementById('nav-projects');
const dashboardSummary = document.getElementById('dashboard-summary');
const cutTableWrap = document.getElementById('cut-table-wrap');
const cutTbody = document.getElementById('cut-tbody');
const errorList = document.getElementById('error-list');
const generateAllBtn = document.getElementById('generate-all-btn');

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
  const res = await fetch('/api/projects');
  const data = await res.json();

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

  const total = (m.cuts || []).length + (m.validationErrors || []).length;

  dashboardSummary.innerHTML = `
    <div class="panel">
      <div class="back-row"><button class="link-btn" id="back-btn" type="button">← Voltar</button></div>
      <h2>${escapeHtml(m.project || p.name)}</h2>
      <p class="p-sub">${m.cuts ? m.cuts.length : 0} corte(s) válido(s) · ${total} total · duração ${msToClock(m.videoDurationMs)}</p>
    </div>`;

  document.getElementById('back-btn').addEventListener('click', () => {
    currentProject = null;
    switchView('projects');
  });

  renderCuts(m.cuts || []);
  renderErrors(m.validationErrors || []);

  generateAllBtn.hidden = !(m.cuts && m.cuts.length > 0);
}

function renderCuts(cuts) {
  if (cuts.length === 0) {
    cutTableWrap.hidden = true;
    return;
  }
  cutTableWrap.hidden = false;
  cutTbody.innerHTML = cuts.map((c, i) => `
    <tr data-id="${c.id}">
      <td>${escapeHtml(String(c.id))}</td>
      <td class="theme">${escapeHtml(c.theme)}</td>
      <td class="title">${escapeHtml(c.title)}</td>
      <td class="time">${escapeHtml(c.start)} → ${escapeHtml(c.end)}</td>
      <td><span class="status ${escapeHtml(c.status || 'PENDENTE')}">${escapeHtml(c.status || 'PENDENTE')}</span></td>
      <td>
        <div class="row-actions">
          <button type="button" data-act="preview" ${c.output ? '' : 'disabled'}>Visualizar</button>
          <button type="button" data-act="edit">Editar</button>
          <button type="button" data-act="generate">Gerar</button>
          <button type="button" data-act="remove">Remover</button>
        </div>
      </td>
    </tr>`).join('');

  cutTbody.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => handleAction(btn));
  });
}

async function handleAction(btn) {
  const row = btn.closest('tr');
  const cutId = Number(row.dataset.id);
  const act = btn.dataset.act;

  if (act === 'generate') {
    await generateCut(currentProject.name, cutId, btn);
  } else if (act === 'preview' || act === 'edit' || act === 'remove') {
    showMessage(`Ação "${act}" será implementada em uma fase futura.`, 'err');
  }
}

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

generateAllBtn.addEventListener('click', () => {
  showMessage('O processamento em lote será implementado na Fase 10.', 'err');
  message.hidden = true;
});

switchView('projects');