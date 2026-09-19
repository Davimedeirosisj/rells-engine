# RELLS ENGINE

Aplicação **local** para Windows que processa cortes de vídeo automaticamente via FFmpeg.

O sistema recebe **vídeo original + SRT + cortes.json** (gerados por um modelo de linguagem externo) e produz MP4 verticais (1080x1920), preservando timestamps com precisão de milissegundos.

## Regras fundamentais

- O vídeo original **nunca** é alterado.
- Os timestamps do `cortes.json` são usados **exatamente** como definidos (sem arredondamento, sem deslocamento).
- A seleção criativa pertence ao modelo externo. A aplicação apenas **processa**.
- Todo o processamento é **local** (sem nuvem, sem IA interna, sem banco de dados).

## Requisitos

- Node.js >= 18
- FFmpeg (e ffprobe) — compilado com `libx264`, `libass` e `libfreetype`

## Instalação

```bash
npm install
cp .env.example .env   # no Windows: copy .env.example .env
npm start              # http://localhost:3000
```

O caminho do FFmpeg pode ser configurado em `.env` via `FFMPEG_PATH` / `FFPROBE_PATH`.

Por segurança, o servidor aceita apenas hosts locais por padrão. Para expor a aplicação na rede, configure `HOST` e defina `ALLOW_REMOTE=1` conscientemente; esta aplicação não possui autenticação.

## Estrutura

```
app/        frontend (estático)
backend/    servidor Express + API
backend/routes/  endpoints (import, projects, cuts, preview, batch, export)
backend/worker/  processamento (cut, preview, batch)
fonts/      Gobold-Bold.ttf
	assets/     imagens opcionais do perfil (avatar.png, verification.png)
projects/   arquivos por projeto
temp/       temporários
tests/      testes automatizados
docs/       documentação
```

## Status das fases

- [x] FASE 1 — Estrutura do projeto e ambiente local
- [x] FASE 2 — Upload/importação
- [x] FASE 3 — Parser e validação do cortes.json
- [x] FASE 4 — Dashboard
- [x] FASE 5 — FFmpeg corte simples
- [x] FASE 6 — 9:16 / 1080x1920
- [x] FASE 7 — GoBold + tema
- [x] FASE 8 — Avatar + perfil
- [x] FASE 9 — Preview
- [x] FASE 10 — Processamento em lote
- [x] FASE 11 — ZIP + manifest
- [x] FASE 12 — Testes completos
- [x] FASE 13 — Polimento da interface