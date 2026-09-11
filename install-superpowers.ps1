# ============================================================================
# SCRIPT: Instalar Superpowers no OpenCode
# Autor: AI Assistant
# Data: $(Get-Date -Format 'yyyy-MM-dd HH:mm')
# ============================================================================

Write-Host "🦸 INSTALANDO SUPERPOWERS NO OPENCODE" -ForegroundColor Cyan
Write-Host "=================================================================================" -ForegroundColor Cyan

# Passo 1: Verificar se o arquivo opencode.json existe
$opencodePath = "$env:USERPROFILE\.config\opencode\opencode.json"

if (Test-Path $opencodePath) {
    Write-Host "[✓] Arquivo encontrado: $opencodePath" -ForegroundColor Green
} else {
    Write-Host "[⚠] Arquivo não encontrado. Criando..." -ForegroundColor Yellow
    
    # Cria o arquivo se não existir
    $json = @{
        "name" = "OpenCode"
        "plugin" = @()
        "mcpServers" = @{}
    } | ConvertTo-Json -Depth 10
    
    $opencodePath | Set-Content ($json) -Force
    Write-Host "[✓] Arquivo criado com sucesso!" -ForegroundColor Green
}

# Passo 2: Adicionar Superpowers ao plugin array
Write-Host "`n[🔄] Adicionando Superpowers..." -ForegroundColor Cyan

$plugin = Get-Content $opencodePath -Raw
$newPlugin = $plugin -replace '"plugin"\s*:\s*\[(.*?)\]', '"plugin": ["superpowers@git+https://github.com/obra/superpowers.git", "$1"]'

if ($plugin -notmatch '"plugin"') {
    # Adiciona como novo item
    if ($plugin -match '^\{.*\}$') {
        $newPlugin = $plugin -replace '}', '"plugin": ["superpowers@git+https://github.com/obra/superpowers.git"]}'
    } else {
        $newPlugin = $plugin + `"$`n, "plugin": ["superpowers@git+https://github.com/obra/superpowers.git"]`$"`n}"
    }
}

# Passo 3: Salvar o arquivo atualizado
$newPlugin | Set-Content $opencodePath -NoNewline -Force
Write-Host "[✓] Superpowers adicionado ao opencode.json!" -ForegroundColor Green

# Passo 4: Instalar via npm (opcional, se necessário)
Write-Host "`n[📦] Instalando dependências do npm..." -ForegroundColor Cyan
npm install superpowers@git+https://github.com/obra/superpowers.git --prefix "$env:USERPROFILE\.config\opencode"

Write-Host "`n=================================================================================" -ForegroundColor Cyan
Write-Host "[✓] INSTALAÇÃO CONCLUÍDA!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 PRÓXIMOS PASSOS:" -ForegroundColor Yellow
Write-Host "   1. Reinicie o OpenCode"
Write-Host "   2. No OpenCode, digite: use skill tool to list skills"
Write-Host "   3. Verifique se todas as skills aparecem"
Write-Host ""
Write-Host "📖 Documentação completa: https://github.com/obra/superpowers/blob/main/docs/README.opencode.md" -ForegroundColor Cyan
