# Documentacao

A aplicacao e local e nao possui autenticacao por padrao.

- Use `HOST=127.0.0.1` para manter o servidor local.
- O modo remoto exige `ALLOW_REMOTE=1`, `REMOTE_USERNAME` e `REMOTE_PASSWORD`; proteja o trafego com HTTPS em proxy reverso.
- Consulte o endpoint `/api/health` para verificar FFmpeg, ffprobe, yt-dlp e a fonte configurada.
- Os jobs de lote persistem progresso em `projects/<nome>/temp/progress.json`.
