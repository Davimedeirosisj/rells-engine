/**
 * RELLS ENGINE — Testes do endpoint /api/projects/:name/srt
 * 
 * CRITÉRIOS DE ACEITAÇÃO:
 * 1. projeto existente + original.srt existente → 200
 * 2. conteúdo retornado é EXATAMENTE igual ao original.srt
 * 3. Content-Type: application/x-subrip; charset=utf-8
 * 4. Content-Disposition: attachment; filename="original.srt"
 * 5. projeto inexistente → erro 404 apropriado
 * 6. original.srt inexistente → erro 404 apropriado
 * 7. tentativa de path traversal → rejeitada
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import tmp from 'tmp-promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.join(__dirname, '..');
const BACKEND_DIR = path.join(APP_ROOT, 'backend');

let server;

/**
 * Express app em memória para testes
 */
async function createTestServer() {
  // Importar módulos do backend
  const express = await import('express');
  const app = express();
  
  // Adicionar as rotas do backend (simuladas)
  app.use(express.json());
  
  // Rota de teste para o SRT
  app.get('/api/projects/:name/srt', async (req, res) => {
    try {
      const { name } = req.params;
      
      // Sanitização básica
      const sanitized = String(name)
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      if (!sanitized || sanitized === 'sem-nome') {
        throw new Error('Projeto inválido');
      }
      
      // Bloquear path traversal
      if (/[\\/]\.\.?([\\/]|$)/.test(sanitized)) {
        throw new Error('Caminho inválido');
      }
      
      // Caminho do projeto
      const projectDir = path.join(BACKEND_DIR, 'projects-test', sanitized);
      const srtPath = path.join(projectDir, 'original.srt');
      
      if (!fs.existsSync(srtPath)) {
        throw new Error('original.srt não encontrado para este projeto.');
      }
      
      // Ler e retornar o conteúdo EXATO
      const content = fs.readFileSync(srtPath, 'utf8');
      
      res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="original.srt"');
      res.send(content);
    } catch (err) {
      console.error('[ERROR]', err.message);
      res.status(404).json({ ok: false, error: err.message });
    }
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', app: 'rells-engine', version: '0.1.0' });
  });

  return { app };
}

describe('SRT Download Endpoint - /api/projects/:name/srt', () => {
  let tempDir;
  
  beforeEach(async () => {
    // Criar diretório temporário para testes
    tempDir = await tmp.dir({ mode: 0o755 });
  });
  
  afterEach(async () => {
    // Limpar diretório temporário
    if (tempDir) {
      await fs.promises.rm(tempDir.path, { recursive: true, force: true });
    }
  });

  it('deve retornar 200 com conteúdo do SRT para projeto existente', async () => {
    // Preparar um projeto de teste
    const projectDir = path.join(tempDir.path, 'meu-projeto');
    await fs.promises.mkdir(path.join(projectDir, 'output'), { recursive: true });
    await fs.promises.mkdir(path.join(projectDir, 'temp'), { recursive: true });
    
    // Criar manifest.json
    const manifest = {
      project: 'meu-projeto',
      sourceVideo: 'original.mp4',
      sourceSrt: 'original.srt',
      importedAt: new Date().toISOString(),
      videoDurationMs: 120000,
      cuts: [],
      validationErrors: []
    };
    await fs.promises.writeFile(
      path.join(projectDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    );
    
    // Criar original.srt com conteúdo de exemplo
    const srtContent = `1
00:00:01,000 --> 00:00:05,000
Olá, bem-vindo ao vídeo.

2
00:00:05,000 --> 00:00:10,000
Este é um exemplo de legenda SRT gerada pelo Whisper.`;
    
    await fs.promises.writeFile(
      path.join(projectDir, 'original.srt'),
      srtContent
    );

    // Testar a rota
    const response = await fetch('http://localhost:3000/api/projects/meu-projeto/srt');
    
    assert.strictEqual(response.status, 200);
    assert.ok(response.headers.get('content-type').includes('application/x-subrip'));
    assert.ok(response.headers.get('content-disposition').includes('attachment; filename="original.srt"'));
    
    const text = await response.text();
    assert.strictEqual(text, srtContent);
  });

  it('deve retornar conteúdo EXATAMENTE igual ao arquivo original', async () => {
    // Preparar projeto com SRT específico
    const projectDir = path.join(tempDir.path, 'teste-contenido');
    await fs.promises.mkdir(path.join(projectDir, 'output'), { recursive: true });
    
    const manifest = { project: 'teste-contenido', sourceSrt: 'original.srt' };
    await fs.promises.writeFile(path.join(projectDir, 'manifest.json'), JSON.stringify(manifest));

    // Conteúdo EXATO do SRT (com quebras de linha específicas)
    const expectedContent = `1
00:00:01,500 --> 00:00:02,000
Primeira legenda com espaço em branco no final.  
`;

    await fs.promises.writeFile(
      path.join(projectDir, 'original.srt'),
      expectedContent
    );

    const response = await fetch('http://localhost:3000/api/projects/teste-contenido/srt');
    assert.strictEqual(response.status, 200);

    const receivedContent = await response.text();
    assert.strictEqual(receivedContent, expectedContent);
    
    // Verificar byte-a-byte
    const expectedBuffer = Buffer.from(expectedContent, 'utf8');
    const receivedBuffer = Buffer.from(receivedContent, 'utf8');
    assert.strictEqual(receivedBuffer.length, expectedBuffer.length);
  });

  it('deve retornar Content-Type: application/x-subrip; charset=utf-8', async () => {
    const projectDir = path.join(tempDir.path, 'content-type-test');
    await fs.promises.mkdir(path.join(projectDir, 'output'), { recursive: true });
    
    const manifest = { project: 'content-type-test' };
    await fs.promises.writeFile(path.join(projectDir, 'manifest.json'), JSON.stringify(manifest));

    const srtContent = '1\n00:00:01,000 --> 00:00:05,000\nTeste.';
    await fs.promises.writeFile(path.join(projectDir, 'original.srt'), srtContent);

    const response = await fetch('http://localhost:3000/api/projects/content-type-test/srt');
    assert.strictEqual(response.status, 200);
    
    const contentType = response.headers.get('content-type');
    assert.ok(
      contentType && contentType.includes('application/x-subrip') && 
      contentType.includes('charset=utf-8'),
      `Content-Type incorreto: ${contentType}`
    );
  });

  it('deve retornar Content-Disposition com attachment e filename correto', async () => {
    const projectDir = path.join(tempDir.path, 'disposition-test');
    await fs.promises.mkdir(path.join(projectDir, 'output'), { recursive: true });
    
    const manifest = { project: 'disposition-test' };
    await fs.promises.writeFile(path.join(projectDir, 'manifest.json'), JSON.stringify(manifest));

    await fs.promises.writeFile(path.join(projectDir, 'original.srt'), 'Teste');

    const response = await fetch('http://localhost:3000/api/projects/disposition-test/srt');
    assert.strictEqual(response.status, 200);
    
    const disposition = response.headers.get('content-disposition');
    assert.ok(
      disposition && 
      disposition.includes('attachment') &&
      disposition.includes('filename="original.srt"'),
      `Content-Disposition incorreto: ${disposition}`
    );
  });

  it('deve retornar erro 404 para projeto inexistente', async () => {
    const response = await fetch('http://localhost:3000/api/projects/nao-existe/srt');
    
    assert.strictEqual(response.status, 404);
    const data = await response.json();
    assert.ok(data.ok === false);
    assert.ok(data.error && data.error.includes('não encontrado'));
  });

  it('deve retornar erro apropriado quando original.srt não existe', async () => {
    // Criar projeto SEM o arquivo original.srt
    const projectDir = path.join(tempDir.path, 'sem-srt');
    await fs.promises.mkdir(path.join(projectDir, 'output'), { recursive: true });
    
    const manifest = { 
      project: 'sem-srt',
      sourceVideo: 'original.mp4'
      // NOT sourceSrt
    };
    await fs.promises.writeFile(path.join(projectDir, 'manifest.json'), JSON.stringify(manifest));

    const response = await fetch('http://localhost:3000/api/projects/sem-srt/srt');
    
    assert.strictEqual(response.status, 404);
    const data = await response.json();
    assert.ok(data.ok === false);
    assert.ok(data.error && data.error.includes('original.srt não encontrado'));
  });

  it('deve rejeitar path traversal no parâmetro :name', async () => {
    // Tentar acessar arquivo fora do diretório de projetos usando ../
    const maliciousName = '../../../etc/passwd';
    
    const response = await fetch(
      `http://localhost:3000/api/projects/${encodeURIComponent(maliciousName)}/srt`
    );
    
    assert.strictEqual(response.status, 404);
    const data = await response.json();
    assert.ok(data.ok === false);
    // O erro deve indicar que o projeto não foi encontrado (não vazou arquivos sensíveis)
    assert.ok(data.error && !data.error.includes('passwd'));
  });

  it('deve lidar com nomes de arquivo com acentos e caracteres especiais', async () => {
    const projectDir = path.join(tempDir.path, 'projeto-teste-9-setembro-2026');
    await fs.promises.mkdir(path.join(projectDir, 'output'), { recursive: true });
    
    const manifest = { 
      project: 'projeto-teste-9-setembro-2026',
      sourceSrt: 'original.srt'
    };
    await fs.promises.writeFile(path.join(projectDir, 'manifest.json'), JSON.stringify(manifest));

    const srtContent = `1
00:00:00,000 --> 00:00:05,000
Teste com acentos: áéíóú âêîôû ãõñ ç ü.
`;
    await fs.promises.writeFile(path.join(projectDir, 'original.srt'), srtContent);

    const response = await fetch('http://localhost:3000/api/projects/projeto-teste-9-setembro-2026/srt');
    assert.strictEqual(response.status, 200);
    
    const received = await response.text();
    assert.strictEqual(received.trim(), srtContent.trim());
  });

  it('deve suportar SRTs longos com múltiplos blocos', async () => {
    const projectDir = path.join(tempDir.path, 'long-srt');
    await fs.promises.mkdir(path.join(projectDir, 'output'), { recursive: true });
    
    const manifest = { project: 'long-srt' };
    await fs.promises.writeFile(path.join(projectDir, 'manifest.json'), JSON.stringify(manifest));

    // Criar SRT longo com 10 blocos de legenda
    let srtContent = '';
    for (let i = 1; i <= 10; i++) {
      srtContent += `${i}\n`;
      srtContent += `00:0${i}:01,500 --> 00:0${i + 1}:05,000\n`;
      srtContent += `Texto da legenda número ${i} com bastante conteúdo para testar o limite de caracteres.\n`;
      srtContent += '\n';
    }

    await fs.promises.writeFile(path.join(projectDir, 'original.srt'), srtContent);

    const response = await fetch('http://localhost:3000/api/projects/long-srt/srt');
    assert.strictEqual(response.status, 200);
    
    const received = await response.text();
    assert.strictEqual(received, srtContent);
  });

  it('deve manter quebras de linha e espaços em branco exatamente como no original', async () => {
    const projectDir = path.join(tempDir.path, 'whitespace-test');
    await fs.promises.mkdir(path.join(projectDir, 'output'), { recursive: true });
    
    const manifest = { project: 'whitespace-test' };
    await fs.promises.writeFile(path.join(projectDir, 'manifest.json'), JSON.stringify(manifest));

    // SRT com espaços em branco variados e quebras de linha específicas
    const exactContent = `1
00:00:01,000 --> 00:00:05,000  
Texto com espaço final.

2
00:00:05,000 --> 00:00:10,000

Texto em branco aqui.


3
00:00:10,000 --> 00:00:15,000  
Última legenda. `;

    await fs.promises.writeFile(path.join(projectDir, 'original.srt'), exactContent);

    const response = await fetch('http://localhost:3000/api/projects/whitespace-test/srt');
    assert.strictEqual(response.status, 200);

    const received = await response.text();
    
    // Verificação byte-a-byte exata
    const expectedBytes = Buffer.from(exactContent);
    const receivedBytes = Buffer.from(received);
    assert.strictEqual(
      expectedBytes.toString('hex'),
      receivedBytes.toString('hex'),
      'Conteúdo não é byte-a-byte idêntico'
    );
  });

  it('deve lidar com nomes de projeto muito longos (até limite do sistema operacional)', async () => {
    const projectName = 'projeto-' + 'a'.repeat(200); // Nome longo mas válido
    
    const projectDir = path.join(tempDir.path, projectName);
    await fs.promises.mkdir(path.join(projectDir, 'output'), { recursive: true });
    
    const manifest = { project: projectName };
    await fs.promises.writeFile(path.join(projectDir, 'manifest.json'), JSON.stringify(manifest));

    await fs.promises.writeFile(path.join(projectDir, 'original.srt'), 'Teste');

    const response = await fetch(`http://localhost:3000/api/projects/${encodeURIComponent(projectName)}/srt`);
    assert.strictEqual(response.status, 200);
    
    const received = await response.text();
    assert.strictEqual(received, 'Teste');
  });

  it('deve retornar erro para nome de projeto vazio', async () => {
    const response = await fetch('http://localhost:3000/api/projects//srt');
    
    assert.strictEqual(response.status, 404);
    const data = await response.json();
    assert.ok(data.ok === false);
  });

  it('deve retornar erro para nome de projeto com caracteres proibidos', async () => {
    const maliciousName = '../etc/passwd';
    
    const response = await fetch(
      `http://localhost:3000/api/projects/${encodeURIComponent(maliciousName)}/srt`
    );
    
    assert.strictEqual(response.status, 404);
    const data = await response.json();
    assert.ok(data.ok === false);
    assert.ok(!data.error.includes('passwd')); // Não deve acessar arquivos sensíveis
  });

  it('deve suportar caracteres unicode completos em legendas', async () => {
    const projectDir = path.join(tempDir.path, 'unicode-test');
    await fs.promises.mkdir(path.join(projectDir, 'output'), { recursive: true });
    
    const manifest = { project: 'unicode-test' };
    await fs.promises.writeFile(path.join(projectDir, 'manifest.json'), JSON.stringify(manifest));

    // Conteúdo unicode completo
    const srtContent = `1
00:00:01,000 --> 00:00:05,000
Portuguese: Olá Mundo 🌍
Chinese: 你好世界 🇨🇳
Japanese: こんにちは🇯🇵
Korean: 안녕하세요🇰🇷
Emoji: 🎉🎊🎈🎁⭐
Math: ∑∫∂√πφ∞≤≥≠≈
Arrows: →↑↓←⇐⇒↔↕
Cyrillic: Привет мир🇷🇺
Greek: Γεια σου κόσμε🇬🇷`;

    await fs.promises.writeFile(path.join(projectDir, 'original.srt'), srtContent);

    const response = await fetch('http://localhost:3000/api/projects/unicode-test/srt');
    assert.strictEqual(response.status, 200);
    
    const received = await response.text();
    assert.strictEqual(received, srtContent);
  });
});

describe('Fluxo completo: Vídeo → Whisper → SRT_READY → Download', () => {
  let tempDir;
  
  beforeEach(async () => {
    // Criar diretório temporário para teste de fluxo completo
    tempDir = await tmp.dir({ mode: 0o755 });
  });
  
  afterEach(async () => {
    // Limpar diretório temporário
    if (tempDir) {
      await fs.promises.rm(tempDir.path, { recursive: true, force: true });
    }
  });

  it('deve simular o fluxo completo e permitir download do SRT gerado', async () => {
    // Simulação do fluxo oficial:
    // VÍDEO → WHISPER LOCAL → original.srt → usuário pode SALVAR SRT
    
    const projectDir = path.join(tempDir.path, 'culto-08-setembro-2026');
    
    await fs.promises.mkdir(path.join(projectDir, 'output'), { recursive: true });
    await fs.promises.mkdir(path.join(projectDir, 'temp'), { recursive: true });
    
    // Simular transcrição do Whisper com SRT completo
    const mockSrtContent = `1
00:00:00,500 --> 00:00:04,500
Boas vindas à transmissão em tempo real.

2
00:00:04,500 --> 00:00:12,000
Estamos juntos aqui neste momento de reflexão espiritual.

3
00:00:12,000 --> 00:00:18,500
Este é o conteúdo transcrito pelo Whisper local com alta precisão.`;
    
    await fs.promises.writeFile(
      path.join(projectDir, 'original.srt'),
      mockSrtContent
    );

    const manifest = {
      project: 'culto-08-setembro-2026',
      sourceVideo: 'original.mp4',
      sourceSrt: 'original.srt',
      importedAt: new Date().toISOString(),
      videoDurationMs: 180000,
      cuts: [],
      validationErrors: []
    };
    await fs.promises.writeFile(
      path.join(projectDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    );

    // Simular estado SRT_READY no frontend (como faria finishSrtReady())
    const stage1 = document.getElementById('stage1');
    
    // O botão deve ser adicionado quando o estado for SRT_READY
    const downloadBtn = document.createElement('button');
    downloadBtn.id = 'srt-download-btn';
    downloadBtn.textContent = '[SALVAR SRT]';
    stage1.appendChild(downloadBtn);

    // Clicar no botão para testar o download
    downloadBtn.click();
    
    // Verificar que o download foi acionado (em ambiente real, isso baixaria o arquivo)
    // Em teste, verificamos apenas que a rota é acessível e retorna 200
    const response = await fetch('http://localhost:3000/api/projects/culto-08-setembro-2026/srt');
    assert.strictEqual(response.status, 200);
    
    const receivedContent = await response.text();
    assert.strictEqual(receivedContent, mockSrtContent);
    
    // Verificar que o conteúdo é byte-a-byte idêntico ao original
    const expectedBuffer = Buffer.from(mockSrtContent, 'utf8');
    const receivedBuffer = Buffer.from(receivedContent, 'utf8');
    assert.strictEqual(
      expectedBuffer.toString('base64'),
      receivedBuffer.toString('base64')
    );
    
    // O arquivo baixado deve ser byte-a-byte equivalente ao original.srt
    assert.deepStrictEqual(expectedBuffer, receivedBuffer);
  });

  it('deve mostrar erro quando SRT ainda está sendo gerado (não SRT_READY)', async () => {
    const projectDir = path.join(tempDir.path, 'aguardando-whisper');
    
    await fs.promises.mkdir(path.join(projectDir, 'output'), { recursive: true });
    
    // Projeto criado mas transcrição ainda em andamento
    const manifest = {
      project: 'aguardando-whisper',
      sourceVideo: 'original.mp4',
      importedAt: new Date().toISOString(),
      videoDurationMs: 300000,
      cuts: [],
      validationErrors: []
      // NOT sourceSrt — ainda sem SRT gerado
    };
    await fs.promises.writeFile(
      path.join(projectDir, 'manifest.json'),
      JSON.stringify(manifest)
    );

    // O endpoint deve retornar erro porque original.srt não existe ainda
    const response = await fetch('http://localhost:3000/api/projects/aguardando-whisper/srt');
    
    assert.strictEqual(response.status, 404);
    const data = await response.json();
    assert.ok(data.ok === false);
    assert.ok(data.error && data.error.includes('original.srt não encontrado'));
    
    // O botão [SALVAR SRT] NÃO deve ser mostrado neste estado (finishSrtReady só é chamado em SRT_READY)
  });

  it('deve preservar timestamps e formatação exatamente como Whisper produziu', async () => {
    const projectDir = path.join(tempDir.path, 'preciso-milissegundos');
    
    await fs.promises.mkdir(path.join(projectDir, 'output'), { recursive: true });
    
    // SRT com timestamps de milissegundos exatos (como Whisper gera)
    const exactSrtContent = `1
00:00:01,123 --> 00:00:04,456
Primeiro corte com timestamp preciso.

2
00:00:04,456 --> 00:00:08,789
Segundo corte preservando milissegundos.

3
00:00:08,789 --> 00:00:12,012
Terceiro corte com timestamp exato.`;
    
    await fs.promises.writeFile(
      path.join(projectDir, 'original.srt'),
      exactSrtContent
    );

    const response = await fetch('http://localhost:3000/api/projects/preciso-milissegundos/srt');
    assert.strictEqual(response.status, 200);
    
    const received = await response.text();
    assert.strictEqual(received, exactSrtContent);
    
    // Verificar timestamps específicos
    assert.ok(received.includes('00:00:01,123'));
    assert.ok(received.includes('00:00:04,456'));
    assert.ok(received.includes('00:00:08,789'));
  });

  it('deve ser chamado uma única vez sem múltiplos downloads falsos', async () => {
    const projectDir = path.join(tempDir.path, 'single-download');
    
    await fs.promises.mkdir(path.join(projectDir, 'output'), { recursive: true });
    
    const manifest = { 
      project: 'single-download',
      sourceSrt: 'original.srt'
    };
    await fs.promises.writeFile(path.join(projectDir, 'manifest.json'), JSON.stringify(manifest));

    await fs.promises.writeFile(path.join(projectDir, 'original.srt'), 'Teste');

    // Chamar a rota múltiplas vezes - cada uma deve retornar o mesmo arquivo real
    const responses = [];
    for (let i = 0; i < 3; i++) {
      const r = await fetch('http://localhost:3000/api/projects/single-download/srt');
      assert.strictEqual(r.status, 200);
      const content = await r.text();
      responses.push(content);
    }
    
    // Todos os downloads devem ser idênticos (o mesmo arquivo real)
    assert.deepStrictEqual(responses[0], responses[1]);
    assert.deepStrictEqual(responses[1], responses[2]);
    assert.strictEqual(responses[0], 'Teste');
  });
});
