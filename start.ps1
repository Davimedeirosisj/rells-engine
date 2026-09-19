# Rells Engine - Inicialização Rápida
Write-Host "🚀 Iniciando Rells Engine..." -ForegroundColor Cyan

$env:PORT = 3000
$env:HOST = 'localhost'

Write-Host ""
Write-Host "Verificando dependências..." -ForegroundColor Yellow

# Verifica FFmpeg
$ffmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
if ($ffmpeg) {
    Write-Host "✅ FFmpeg: Disponível" -ForegroundColor Green
} else {
    Write-Host "⚠️  FFmpeg: Não encontrado (necessário para renderização)" -ForegroundColor Yellow
}

$ffprobe = Get-Command ffprobe -ErrorAction SilentlyContinue
if ($ffprobe) {
    Write-Host "✅ FFprobe: Disponível" -ForegroundColor Green
} else {
    Write-Host "⚠️  FFprobe: Não encontrado (necessário para importação)" -ForegroundColor Yellow
}

# Verifica yt-dlp
$ytdlpTest = Start-Process -FilePath 'yt-dlp' -ArgumentList "--version" -PassThru -Wait -RedirectStandardOutput $null 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ yt-dlp: Disponível" -ForegroundColor Green
} else {
    Write-Host "⚠️  yt-dlp: Não encontrado (necessário para download YouTube)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Iniciando servidor..." -ForegroundColor Cyan

node backend/server.js

Write-Host ""
Write-Host "🎬 Servidor iniciado em http://localhost:3000" -ForegroundColor Green
Write-Host "   API: http://localhost:3000/api/health" -ForegroundColor Gray
Write-Host ""
Write-Host "Pressione Ctrl+C para parar o servidor" -ForegroundColor Yellow
