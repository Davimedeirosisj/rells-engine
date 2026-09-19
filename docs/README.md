# Documentacao

A aplicacao e local e nao possui autenticacao por padrao.

- Use `HOST=127.0.0.1` para manter o servidor local.
- Defina `ALLOW_REMOTE=1` somente quando a exposicao na rede for intencional e houver uma camada de protecao externa.
- Consulte o endpoint `/api/health` para verificar FFmpeg, ffprobe, yt-dlp e a fonte configurada.
- Os jobs de lote persistem progresso em `projects/<nome>/temp/progress.json`.
