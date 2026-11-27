# Anladın mı? — Kurulum (Windows)

Başka bir bilgisayarda denemek için. Gerekenler: **VS Code**, **Git**, **Python 3.10+**.
Eklentinin `.vsix` dosyası yoksa **Node.js** de gerekir (script kendisi derler).

## 1. Kur

Repoyu klonlayın; elinizde `anladin-mi-*.vsix` dosyası varsa `extension/` klasörüne koyun. Sonra
repo klasöründe:

```powershell
powershell -ExecutionPolicy Bypass -File kurulum.ps1
```

Script şunları yapar (tekrar çalıştırmak güvenli, hazır olanı atlar):
- `backend/.venv` Python ortamını kurar, paketleri yükler
- `backend/.env` yoksa Claude API anahtarını sorar (ekranda görünmez, git'e girmez)
- VS Code eklentisini kurar (`.vsix` yoksa derler)

Sadece arayüzü denemek için (API anahtarı ve Python gerekmez, hazır örnek sorular):

```powershell
powershell -ExecutionPolicy Bypass -File kurulum.ps1 -AnahtarsizDene
```

## 2. Backend'i başlat

Test boyunca bu pencere açık kalsın (anahtarsız denemede gerekmez):

```powershell
powershell -ExecutionPolicy Bypass -File baslat.ps1
```

## 3. Dene

1. VS Code'u kapatıp açın.
2. Test edeceğiniz projeyi (herhangi bir git reposu) VS Code'da açın. "Bu klasördeki dosyaların
   yazarlarına güveniyor musunuz?" sorusuna **Evet** deyin; yoksa VS Code eklentiyi kapatır
   (sol altta *Restricted Mode* yazar).
3. "Anladın mı? … reposuna bağlandı" bildirimi çıkar. Hook sadece o bilgisayardaki `.git/hooks`
   içine kurulur, GitHub'a gitmez. İstemezseniz bildirimdeki **Geri al**.
4. Bir değişiklik yapıp stage edin, mavi **Commit** butonuna basın: quiz açılır, bitince commit
   devam eder.

Ayarlar: Eklentiler sekmesi → Anladın mı? → ⚙ → **Görünüm ve ayarlar**.

**Maliyet:** her quiz Claude Haiku'ya bir istek atar; büyüklüğe göre ~0,1–0,5 sent.
