# Anladın mı? — tek komutla kurulum (Windows)
#
#   powershell -ExecutionPolicy Bypass -File kurulum.ps1
#
# Yaptıkları:
#   1. Gerekenleri kontrol eder: VS Code ("code" komutu), Git, Python 3.10+
#   2. backend/.venv'i kurar ve paketleri yükler
#   3. backend/.env yoksa Claude API anahtarını sorar ve oraya yazar (git'e girmez)
#   4. Eklentiyi kurar: extension/ içindeki en yeni .vsix'i, yoksa Node ile derleyip
#
# Tekrar çalıştırmak güvenlidir: hazır olan adımları atlar.
# Sadece arayüzü denemek için (API anahtarsız): -AnahtarsizDene

param(
    [switch]$AnahtarsizDene  # .env sorma; eklentide "Örnek sorular" modu açılır
)

# "Stop" değil: Windows PowerShell 5.1'de programların stderr'e yazdığı uyarılar (code, npm, pip)
# hata sayılıp script'i durduruyor. Her adımın sonucunu $LASTEXITCODE ile kendimiz kontrol ediyoruz.
$ErrorActionPreference = "Continue"
$kok = $PSScriptRoot
$backend = Join-Path $kok "backend"
$eklenti = Join-Path $kok "extension"

function Adim($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Tamam($m) { Write-Host "    ✓ $m" -ForegroundColor Green }
function Dur($m) { Write-Host "`n✗ $m" -ForegroundColor Red; exit 1 }

# ------------------------------------------------------------------ 1. gerekenler
Adim "Gerekenler kontrol ediliyor"

if (-not (Get-Command code -ErrorAction SilentlyContinue)) {
    Dur "'code' komutu bulunamadı. VS Code kurulu mu? Kuruluysa VS Code'da Ctrl+Shift+P > 'Shell Command: Install code command in PATH' (ya da VS Code'u yeniden kurarken 'Add to PATH' seçin), sonra yeni bir terminal açın."
}
Tamam "VS Code"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Dur "Git bulunamadı: https://git-scm.com/download/win" }
Tamam "Git"

if (-not $AnahtarsizDene) {
# Python: önce 'py' başlatıcısı, sonra 'python' (Microsoft Store kısayolu sahte olabilir, sürümü sorarak doğrula)
$python = $null
# PATH'te olmasa da standart kurulum klasörlerine bak (winget/python.org bazen PATH'e eklemez)
$klasorler = @("$env:LOCALAPPDATA\Programs\Python", "$env:ProgramFiles", "${env:ProgramFiles(x86)}") | Where-Object { $_ -and (Test-Path $_) }
$yerel = foreach ($k in $klasorler) {
    Get-ChildItem $k -Directory -Filter "Python3*" -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName "python.exe" } | Where-Object { Test-Path $_ }
}
$adaylar = @(@("py", "-3"), @("python")) + @($yerel | ForEach-Object { , @($_) })
foreach ($aday in $adaylar) {
    if (-not (Get-Command $aday[0] -ErrorAction SilentlyContinue)) { continue }
    try {
        $surum = & $aday[0] @($aday[1..9] | Where-Object { $_ }) -c "import sys; print('%d.%d' % sys.version_info[:2])" 2>$null
    } catch { continue }
    if ($surum -and [version]$surum -ge [version]"3.10") { $python = $aday; break }
}
if (-not $python) { Dur "Python 3.10 veya üstü bulunamadı: https://www.python.org/downloads/ (kurarken 'Add python.exe to PATH' işaretleyin)" }
Tamam "Python $surum"

# ------------------------------------------------------------------ 2. backend ortamı
Adim "Backend Python ortamı (backend/.venv)"
$venvPy = Join-Path $backend ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPy)) {
    & $python[0] @($python[1..9] | Where-Object { $_ }) -m venv (Join-Path $backend ".venv")
    if ($LASTEXITCODE -ne 0) { Dur "venv oluşturulamadı." }
}
& $venvPy -m pip install --disable-pip-version-check -q -r (Join-Path $backend "requirements.txt")
if ($LASTEXITCODE -ne 0) { Dur "Paketler yüklenemedi (internet bağlantısını kontrol edin)." }
Tamam "Paketler yüklü"

# ------------------------------------------------------------------ 3. API anahtarı
Adim "Claude API anahtarı (backend/.env)"
$envDosyasi = Join-Path $backend ".env"
if (Test-Path $envDosyasi) {
    Tamam ".env zaten var (dokunulmadı)"
} elseif ($env:ANTHROPIC_API_KEY -or [Environment]::GetEnvironmentVariable("ANTHROPIC_API_KEY", "User")) {
    Tamam "ANTHROPIC_API_KEY ortam değişkeninde tanımlı, .env gerekmiyor"
} else {
    $gizli = Read-Host "    Anahtarı yapıştırın (ekranda görünmez)" -AsSecureString
    $anahtar = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($gizli))
    if (-not $anahtar.Trim()) { Dur "Anahtar boş. Tekrar çalıştırın ya da -AnahtarsizDene kullanın." }
    # BOM'suz UTF-8: python-dotenv BOM'u anahtar adının parçası sanabiliyor
    [IO.File]::WriteAllText($envDosyasi, "ANTHROPIC_API_KEY=$($anahtar.Trim())`n", (New-Object Text.UTF8Encoding $false))
    $anahtar = $null
    Tamam ".env yazıldı (git'e girmez)"
}
} else {
    Write-Host "    Anahtarsız deneme: Python, backend ve API anahtarı atlandı; eklentide örnek sorular kullanılacak." -ForegroundColor Yellow
}

# ------------------------------------------------------------------ 4. eklenti
Adim "VS Code eklentisi"
$vsix = Get-ChildItem $eklenti -Filter "anladin-mi-*.vsix" -ErrorAction SilentlyContinue |
    Sort-Object { [version]($_.BaseName -replace "^anladin-mi-", "") } -Descending | Select-Object -First 1
if (-not $vsix) {
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Dur "extension/ içinde .vsix yok ve Node.js (npm) kurulu değil. Ya .vsix dosyasını extension/ klasörüne koyun ya da Node.js kurun: https://nodejs.org"
    }
    Write-Host "    .vsix yok, derleniyor (npm install + package)..."
    Push-Location $eklenti
    try {
        npm install --no-audit --no-fund --loglevel=error
        if ($LASTEXITCODE -ne 0) { Dur "npm install başarısız." }
        npm run package --silent
        if ($LASTEXITCODE -ne 0) { Dur "Eklenti paketlenemedi." }
    } finally { Pop-Location }
    $vsix = Get-ChildItem $eklenti -Filter "anladin-mi-*.vsix" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
}
code --install-extension $vsix.FullName --force 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { Dur "Eklenti kurulamadı: $($vsix.Name)" }
Tamam "$($vsix.Name) kuruldu"

if ($AnahtarsizDene) {
    # Kullanıcı ayarına mockMode=true yaz (VS Code settings.json)
    $ayarYolu = Join-Path $env:APPDATA "Code\User\settings.json"
    $ayar = if (Test-Path $ayarYolu) { Get-Content $ayarYolu -Raw -Encoding UTF8 } else { "{}" }
    if ($ayar -notmatch '"anladinmi\.mockMode"') {
        try {
            $j = $ayar | ConvertFrom-Json
            $j | Add-Member -NotePropertyName "anladinmi.mockMode" -NotePropertyValue $true -Force
            [IO.File]::WriteAllText($ayarYolu, ($j | ConvertTo-Json -Depth 20), (New-Object Text.UTF8Encoding $false))
            Tamam "Örnek sorular modu açıldı"
        } catch {
            Write-Host "    settings.json okunamadı (yorum içeriyor olabilir). Eklenti ayarlarından 'Örnek sorular'ı elle açın." -ForegroundColor Yellow
        }
    }
}

# ------------------------------------------------------------------ bitti
Write-Host "`nKurulum tamam." -ForegroundColor Green
Write-Host @"

Sıradaki adımlar:
  1. Backend'i başlatın (test boyunca açık kalsın):
       powershell -ExecutionPolicy Bypass -File "$(Join-Path $kok 'baslat.ps1')"
  2. VS Code'u kapatıp açın (açıksa: Ctrl+Shift+P > Reload Window).
  3. Test edeceğiniz projeyi VS Code'da açın; "Bu klasöre güveniyor musunuz?" sorusuna Evet (Trust) deyin.
  4. Bir değişiklik yapıp stage edin ve mavi Commit butonuna basın: quiz açılır.
"@
if ($AnahtarsizDene) { Write-Host "  (Anahtarsız denemede 1. adım gerekmez.)" }
