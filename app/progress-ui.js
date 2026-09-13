(() => {
  'use strict';

  const originalFetch = window.fetch.bind(window);
  let activeTimer = null;

  const style = document.createElement('style');
  style.textContent = `
    #realtime-progress{margin:18px 0;padding:18px;border:1px solid rgba(255,255,255,.10);border-radius:16px;background:rgba(20,20,24,.72);backdrop-filter:blur(8px);display:none}
    #realtime-progress.visible{display:block}
    #realtime-progress .rp-head{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:12px}
    #realtime-progress .rp-title{font-weight:800;letter-spacing:.02em}
    #realtime-progress .rp-percent{font-size:22px;font-weight:900}
    #realtime-progress .rp-track{height:9px;border-radius:99px;background:rgba(255,255,255,.10);overflow:hidden}
    #realtime-progress .rp-bar{height:100%;width:0;border-radius:99px;transition:width .25s ease}
    #realtime-progress .rp-meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:14px}
    #realtime-progress .rp-stat{padding:10px 12px;border-radius:10px;background:rgba(255,255,255,.045)}
    #realtime-progress .rp-label{display:block;font-size:11px;opacity:.58;text-transform:uppercase;letter-spacing:.08em}
    #realtime-progress .rp-value{display:block;margin-top:3px;font-weight:800}
    #realtime-progress .rp-message{margin-top:12px;font-size:13px;opacity:.82}
    @media(max-width:700px){#realtime-progress .rp-meta{grid-template-columns:repeat(2,minmax(0,1fr))}}
  `;
  document.head.appendChild(style);

  function ensurePanel() {
    let panel = document.querySelector('#realtime-progress');
    if (panel) return panel;
    panel = document.createElement('section');
    panel.id = 'realtime-progress';
    panel.setAttribute('aria-live', 'polite');
    panel.innerHTML = `
      <div class="rp-head"><div class="rp-title" id="rp-title">PROGRESSO</div><div class="rp-percent" id="rp-percent">0%</div></div>
      <div class="rp-track"><div class="rp-bar" id="rp-bar"></div></div>
      <div class="rp-meta">
        <div class="rp-stat"><span class="rp-label">Decorrido</span><span class="rp-value" id="rp-elapsed">—</span></div>
        <div class="rp-stat"><span class="rp-label">Restante</span><span class="rp-value" id="rp-eta">—</span></div>
        <div class="rp-stat"><span class="rp-label">Velocidade</span><span class="rp-value" id="rp-speed">—</span></div>
        <div class="rp-stat"><span class="rp-label">Etapa</span><span class="rp-value" id="rp-stage">—</span></div>
      </div>
      <div class="rp-message" id="rp-message"></div>`;
    const anchor = document.querySelector('#stage1') || document.querySelector('.flow-card') || document.body;
    anchor.prepend(panel);
    return panel;
  }

  function fmtSeconds(value) {
    if (!Number.isFinite(value)) return '—';
    const s = Math.max(0, Math.round(value));
    if (s < 60) return `${s}s`;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h) return `${h}h ${String(m).padStart(2,'0')}m`;
    return `${m}m ${String(sec).padStart(2,'0')}s`;
  }

  function fmtBytes(value) {
    if (!Number.isFinite(value)) return '—';
    const units = ['B','KB','MB','GB','TB'];
    let n = value; let i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(i ? 1 : 0)} ${units[i]}/s`;
  }

  function updatePanel({ title, progress = 0, elapsedSeconds, estimatedRemainingSeconds, speed, stage, message }) {
    const panel = ensurePanel();
    panel.classList.add('visible');
    const pct = Math.max(0, Math.min(100, Number(progress) || 0));
    panel.querySelector('#rp-title').textContent = title || 'PROGRESSO';
    panel.querySelector('#rp-percent').textContent = `${pct.toFixed(pct < 10 || pct % 1 ? 1 : 0)}%`;
    panel.querySelector('#rp-bar').style.width = `${pct}%`;
    panel.querySelector('#rp-elapsed').textContent = fmtSeconds(elapsedSeconds);
    panel.querySelector('#rp-eta').textContent = Number.isFinite(estimatedRemainingSeconds) ? fmtSeconds(estimatedRemainingSeconds) : 'Calculando…';
    panel.querySelector('#rp-speed').textContent = speed == null ? '—' : (typeof speed === 'number' && speed < 20 ? `${speed.toFixed(1)}x` : fmtBytes(speed));
    panel.querySelector('#rp-stage').textContent = stage || '—';
    panel.querySelector('#rp-message').textContent = message || '';
  }

  function stopPolling() {
    if (activeTimer) clearInterval(activeTimer);
    activeTimer = null;
  }

  async function pollProjectProgress(projectName, mode) {
    stopPolling();
    let tries = 0;
    const endpoint = `/api/projects/${encodeURIComponent(projectName)}/progress`;
    const tick = async () => {
      tries++;
      try {
        const response = await originalFetch(endpoint);
        if (!response.ok) return;
        const data = await response.json();
        const p = data.progress || {};
        const isTranscription = mode === 'TRANSCRIBING' || p.stage === 'WHISPER';
        updatePanel({
          title: isTranscription ? 'GERAÇÃO DA TRANSCRIÇÃO' : 'PROCESSAMENTO DOS CORTES',
          progress: p.progress,
          elapsedSeconds: p.elapsedSeconds,
          estimatedRemainingSeconds: p.estimatedRemainingSeconds,
          speed: p.speed,
          stage: isTranscription ? 'WHISPER' : (p.totalCuts ? `CORTE ${p.currentCut || 0}/${p.totalCuts}` : 'FFMPEG'),
          message: p.message,
        });
        if (p.status === 'SRT_READY' || p.status === 'COMPLETED' || p.status === 'ERROR') stopPolling();
      } catch { /* falha transitória */ }
      if (tries > 7200) stopPolling();
    };
    await tick();
    activeTimer = setInterval(tick, 1000);
  }

  function xhrFetch(url, options) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(options.method || 'GET', url, true);
      const headers = options.headers || {};
      Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));
      xhr.responseType = 'text';

      const startedAt = performance.now();
      const isImport = /\/api\/import$/.test(url) && options.body instanceof FormData;
      const isBatch = /\/api\/projects\/[^/]+\/generate-all$/.test(url) && options.method === 'POST';
      const match = url.match(/\/api\/projects\/([^/]+)\/generate-all$/);
      const projectName = isImport ? options.body.get('name') : (match ? decodeURIComponent(match[1]) : null);

      if (isImport) {
        updatePanel({ title: 'IMPORTAÇÃO DO VÍDEO', progress: 0, elapsedSeconds: 0, stage: 'UPLOAD', message: 'Enviando vídeo para o servidor…' });
        xhr.upload.addEventListener('progress', (event) => {
          if (!event.lengthComputable) return;
          const elapsed = (performance.now() - startedAt) / 1000;
          const rate = elapsed > 0 ? event.loaded / elapsed : null;
          const remaining = rate ? (event.total - event.loaded) / rate : null;
          updatePanel({ title: 'IMPORTAÇÃO DO VÍDEO', progress: (event.loaded / event.total) * 100, elapsedSeconds: elapsed, estimatedRemainingSeconds: remaining, speed: rate, stage: 'UPLOAD', message: `${(event.loaded / 1048576).toFixed(1)} MB de ${(event.total / 1048576).toFixed(1)} MB enviados` });
        });
      } else if (isBatch) {
        updatePanel({ title: 'PROCESSAMENTO DOS CORTES', progress: 0, elapsedSeconds: 0, stage: 'FFMPEG', message: 'Iniciando processamento…' });
        if (projectName) pollProjectProgress(projectName, 'PROCESSING');
      }

      xhr.onload = () => {
        const responseHeaders = new Headers();
        const rawHeaders = xhr.getAllResponseHeaders().trim();
        if (rawHeaders) rawHeaders.split(/[\r\n]+/).forEach((line) => {
          const parts = line.split(': ');
          const key = parts.shift();
          if (key) responseHeaders.append(key, parts.join(': '));
        });
        const response = new Response(xhr.responseText, { status: xhr.status, statusText: xhr.statusText, headers: responseHeaders });
        resolve(response);
        if (isImport && xhr.status >= 200 && xhr.status < 300 && projectName) pollProjectProgress(projectName, 'TRANSCRIBING');
      };
      xhr.onerror = () => reject(new TypeError('Falha de rede durante a operação.'));
      xhr.onabort = () => reject(new DOMException('Operação cancelada.', 'AbortError'));
      xhr.send(options.body || null);
    });
  }

  window.fetch = (input, options = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const method = String(options.method || (typeof input !== 'string' ? input.method : 'GET')).toUpperCase();
    const isImport = /\/api\/import$/.test(url) && method === 'POST' && options.body instanceof FormData;
    const isBatch = /\/api\/projects\/[^/]+\/generate-all$/.test(url) && method === 'POST';
    if (isImport || isBatch) return xhrFetch(url, { ...options, method });
    return originalFetch(input, options);
  };

  document.addEventListener('click', (event) => {
    const button = event.target.closest('#upload-btn, #process-btn');
    if (!button) return;
    setTimeout(() => {
      const panel = document.querySelector('#realtime-progress');
      if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  }, true);
})();
