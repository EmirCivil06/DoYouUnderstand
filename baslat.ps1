# Anladın mı? backend'ini başlatır: http://127.0.0.1:8765 (pencere açık kaldıkça çalışır, durdurmak için Ctrl+C)
#
#   powershell -ExecutionPolicy Bypass -File baslat.ps1
#
# Önce kurulum.ps1 çalıştırılmış olmalı.

$ErrorActionPreference = "Stop"
$backend = Join-Path $PSScriptRoot "backend"
$venvPy = Join-Path $backend ".venv\Scripts\python.exe"

if (-not (Test-Path $venvPy)) {
    Write-Host "Backend kurulu değil. Önce: powershell -ExecutionPolicy Bypass -File kurulum.ps1" -ForegroundColor Red
    exit 1
}

# Terminal, anahtar kullanıcı ortam değişkenine eklenmeden önce açıldıysa onu göremez: kayıttan oku.
if (-not $env:ANTHROPIC_API_KEY) {
    $kullanici = [Environment]::GetEnvironmentVariable("ANTHROPIC_API_KEY", "User")
    if ($kullanici) { $env:ANTHROPIC_API_KEY = $kullanici }
}
if (-not $env:ANTHROPIC_API_KEY -and -not (Test-Path (Join-Path $backend ".env"))) {
    Write-Host "API anahtarı yok: kurulum.ps1'i tekrar çalıştırın (anahtarı sorar)." -ForegroundColor Red
    exit 1
}

Write-Host "Backend başlıyor: http://127.0.0.1:8765  (durdurmak için Ctrl+C)" -ForegroundColor Cyan
Set-Location $backend
& $venvPy main.py
