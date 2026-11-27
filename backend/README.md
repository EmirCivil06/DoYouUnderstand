# anladınmı?

**Commit'lemeden önce, yazdığın (ya da AI'ın yazdığı) kodu gerçekten anladın mı?**

AI artık kodun büyük kısmını yazıyor. Öğrenciler ve stajyerler çoğu zaman anlamadıkları kodu
commit'liyor. Kod çalışıyor ama bir hata çıktığında ya da kod incelemesinde soru geldiğinde
cevap veremiyorlar.

`anladınmı`, `git commit`'ten hemen önce **staged diff'ini** okur ve o koda özel sorular sorar.
Yanlış cevapta kısa, Türkçe bir **ders** anlatır, konu bazında zayıf yönlerini takip eder.

## Neden "kapı" değil, "öğretmen"?

Benzer araçlar (PR quiz'leri, "comprehension gate"ler) takım için birer **kapı**: bilemezsen
merge edemezsin. Biz commit'i **engellemiyoruz, öğretiyoruz.**

- Yanlış cevap verirsen commit yine atılır, ama ne kaçırdığını öğrenmiş olursun.
- GitHub kurulumu, sunucu ya da takım ayarı gerekmez. Yerel bir CLI'dır.
- Zamanla hangi konularda zayıf olduğunu gösterir (hata yönetimi, uç durumlar, async...).

## Nasıl çalışır?

```
git add .  →  anladınmı
               ├─ 1. Güvenlik taraması: diff'te API anahtarı / şifre var mı? (yerel, API'siz)
               ├─ 2. Claude Haiku diff'e özel 3 soru üretir (2 çoktan seçmeli + 1 açık uçlu)
               ├─ 3. Cevabını değerlendirir; yanlışsa kısa bir ders anlatır
               ├─ 4. Sonucu ~/.anladinmi/gecmis.json'a kaydeder (konu bazında ilerleme)
               └─ 5. Commit mesajını sorar ve commit'ler
```

## Kurulum

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
setx ANTHROPIC_API_KEY "anahtarın"   # sonra terminali yeniden aç
```

## Kullanım

Herhangi bir git reposunda, değişikliklerini `git add` ile ekledikten sonra:

| Komut | Ne yapar |
|---|---|
| `python main.py` | Quiz'i başlatır, sonunda commit'i atar |
| `python main.py rapor` | Konu bazında ilerleme raporu ve zayıf konular |
| `python main.py kur` | Bu repoya pre-commit hook kurar: her `git commit`'te quiz otomatik gelir |
| `python main.py kaldir` | Hook'u kaldırır |

Zorluk seviyesi: `kolay` (ne yapıyor?), `orta` (bu girdide ne olur?), `zor` (uç durumlar, güvenlik).

> Hook, terminal olmayan ortamlarda (ör. IDE'nin commit butonu) quiz'i sessizce atlar, commit'e engel olmaz.
> Tek istisna: diff'te gizli bilgi bulunur ve "devam etme" dersen commit durdurulur.

## Dosyalar

| Dosya | Görev |
|---|---|
| `main.py` | Komut satırı ve quiz akışı |
| `ai.py` | Claude ile soru üretme, cevap değerlendirme, ders; gizli bilgi taraması |
| `git_utils.py` | Staged diff, commit, repo adı |
| `ilerleme.py` | Cevap geçmişi ve konu bazında rapor |
| `arayuz.py` | Terminal çıktısı |

## Gizlilik

- Diff, Claude'a gönderilmeden **önce** yerelde API anahtarı / şifre / private key için taranır.
- İlerleme verisi sadece senin bilgisayarında (`~/.anladinmi/gecmis.json`) tutulur.
- `*.lock` ve `package-lock.json` gibi dosyalar diff'e dahil edilmez.
