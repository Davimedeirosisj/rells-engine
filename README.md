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

## Estrutura

```
app/        frontend (estático)
backend/    servidor Express + API
worker/     processador (fases futuras)
ffmpeg/     helpers FFmpeg (fases futuras)
fonts/      Gobold-Bold.ttf
assets/     avatar.png, verification.png
projects/   arquivos por projeto
temp/       temporários
output/     saídas finais
tests/      testes automatizados
docs/       documentação
```

## Status das fases

- [x] FASE 1 — Estrutura do projeto e ambiente local
- [ ] FASE 2 — Upload/importação
- [ ] FASE 3 — Parser e validação do cortes.json
- [ ] FASE 4 — Dashboard
- [ ] FASE 5 — FFmpeg corte simples
- [ ] FASE 6 — 9:16 / 1080x1920
- [ ] FASE 7 — GoBold + tema
- [ ] FASE 8 — Avatar + perfil
- [ ] FASE 9 — Preview
- [ ] FASE 10 — Processamento em lote
- [ ] FASE 11 — ZIP + manifest
- [ ] FASE 12 — Testes completos
- [ ] FASE 13 — Polimento da interface