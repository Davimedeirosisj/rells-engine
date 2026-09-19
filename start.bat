@echo off
chcp 65001 >nul 2>&1
title Rells Engine - Inicialização

echo ========================================
echo    Rells Engine - Iniciando Servidor
echo ========================================
echo.

set PORT=3000
set HOST=localhost

echo Verificando dependencias...
echo.

where ffmpeg >nul 2>&1
if %ERRORLEVEL% == 0 (
    echo [OK] FFmpeg encontrado
) else (
    echo [AVISO] FFmpeg nao encontrado (necessario para renderizacao)
)

where ffprobe >nul 2>&1
if %ERRORLEVEL% == 0 (
    echo [OK] FFprobe encontrado
) else (
    echo [AVISO] FFprobe nao encontrado (necessario para importacao)
)

yt-dlp --version >nul 2>&1
if %ERRORLEVEL% == 0 (
    echo [OK] yt-dlp encontrado
) else (
    echo [AVISO] yt-dlp nao encontrado (necessario para YouTube)
)

echo.
echo Iniciando servidor...
echo.

cd /d "%~dp0"
node backend\server.js

echo.
echo ========================================
echo    Servidor iniciado!
echo ========================================
echo URL: http://localhost:%PORT%
echo API: http://localhost:%PORT%/api/health
echo.
echo Pressione Ctrl+C para parar
echo ========================================
pause
