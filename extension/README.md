# Anladın mı? — VS Code eklentisi

Commit'lemeden önce, stage ettiğin değişiklik hakkında 2–3 soru sorar. Cevaplarını Claude
değerlendirir; eksik kalan yerleri **Türkçe**, yeni başlayan birine anlatır gibi açıklar.

**Kapı değil, öğretmen:** sonuç ne olursa olsun commit atabilirsin. Amaç engellemek değil,
commit'lediğin kodu anlamanı sağlamak.

## Kullanım

Değişikliklerini stage et (Kaynak Denetimi panelinde `+`), sonra her zamanki gibi commit'le:

- **Mavi Commit butonu** (ya da terminalde `git commit`): repo açılınca eklenti sormadan bir
  pre-commit hook kurar (bildirimde **Geri al** var; ayar: `anladinmi.autoConnectHook`). Commit'e
  her basışta quiz kendiliğinden açılır, bitirince commit devam eder. Repoda başka birinin hook'u
  varsa dokunulmaz; hook'u elle kaldırırsan o repoya kendiliğinden tekrar kurulmaz.
- **Commit kutusunda `Ctrl+Enter`**, panelin üstündeki **🎓** butonu ya da Komut Paleti →
  `Anladın mı? ile commit'le`: quiz açılır, sonunda commit'i eklenti atar.

**3 soru** (ayardan 1–5), her biri **5 şıklı ve tek doğru cevaplı**, **tek tek** gelir (`A`–`E` ya da `1`–`5`
ile seç, `Enter` = cevabı kontrol et). Her sorudan hemen sonra doğru şıkkın açıklaması ve her
yanlış şıkkın **aslında ne yaptığı** gösterilir; en sonda doğru/yanlış sayısı ve her sorunun
kısa özeti gelir. Sonuç ne olursa olsun commit
atılabilir. Hook modunda *Quiz'i atla* ya da *Commit'i iptal et* de seçilebilir; quiz sekmesini
kapatmak quiz'i atlamak sayılır.

Değişiklik önemsizse (sadece boşluk/yorum) backend soru üretmez, commit direkt devam eder.

### Hook nasıl çalışıyor?

Eklenti `127.0.0.1` üzerinde rastgele bir portta küçük bir sunucu açar ve port + rastgele bir
token'ı `.git/anladinmi-vscode.json` dosyasına yazar. `.git/hooks/pre-commit` bu adrese `curl`
ile istek atar ve quiz bitene kadar bekler. **VS Code kapalıysa, token tutmazsa ya da bir hata
olursa hook commit'e karışmaz.** Hook'u kaldırmak için: Komut Paleti →
`Anladın mı?: Commit butonundan ayır`.

## Mimari

```
VS Code eklentisi (bu klasör)  ── HTTP ──▶  backend/ (FastAPI, 127.0.0.1:8765)  ──▶  Claude API
 - staged diff + bağlam toplar               - soru üretir, cevapları puanlar
 - soruları/sonuçları webview'de gösterir    - API anahtarı sadece burada (.env)
 - commit'i atar (git eklentisi API'si)
```

Sözleşme: `backend/CLAUDE.md` bölüm 4 (kaynak: `backend/src/schemas.py`). Eklenti sorular için
yalnızca `id, question, file, line_hint, topic, options` alanlarını alır (beyaz liste): doğru şık ya da
açıklama yanlışlıkla gönderilse bile cevaplamadan önce asla gösterilmez.

## Backend ile konuşma (özet)

| Uç | Eklenti gönderir | Eklenti kullanır |
|---|---|---|
| `GET /health` | – | `ok` |
| `POST /questions` | `diff`, `context`, `params: {num_questions (1–5), difficulty, language, focus_topics}` | `session_id`, `questions[].options` (5 şık, `a`–`e`), `omitted_files` |
| `POST /evaluate` | `{session_id, answers: [{question_id, option_id}]}` | `results[].correct`, `correct_option`, `options[].is_correct / explanation` |

- Eklenti her soru cevaplanınca **hemen** `/evaluate` çağırır; `answers`'ta **tek soru** vardır.
  Backend oturumdaki tüm soruları döndürür, eklenti sadece sorduğunu alır (`src/backend.ts` → `sonucCevir`).
- Ekranda doğru şıkkın `explanation`'ı "neden doğru", diğerlerininki "aslında ne yapar" olarak gösterilir.
  Şık harfleri ekranda büyük (`A`–`E`) görünür.
- `omitted_files` doluysa soru ekranında "bu dosyalar hakkında soru sorulmadı" notu çıkar.
- Soru yoksa (önemsiz diff) hook modunda commit direkt devam eder.

Örnek veri: `src/ornekSorular.ts` (mock mod ve sahte backend bunu kullanıyor).

## Ayarlar

| Ayar | Varsayılan | Açıklama |
|---|---|---|
| `anladinmi.backendUrl` | `http://127.0.0.1:8765` | Backend adresi |
| `anladinmi.difficulty` | `orta` | `kolay` / `orta` / `zor` |
| `anladinmi.numQuestions` | `3` | 1–5 |
| `anladinmi.autoConnectHook` | `true` | Repo açılınca Commit butonunu sormadan quiz'e bağla |
| `anladinmi.mockMode` | `false` | Backend'e hiç gitmeden örnek sorular (çevrimdışı demo) |
| `anladinmi.ui.correctColor` | `#22c55e` | Doğru cevap rengi |
| `anladinmi.ui.wrongColor` | `#ef4444` | Yanlış cevap rengi |
| `anladinmi.ui.optionSize` | `normal` | Şık kutuları: `kompakt` / `normal` / `genis` |
| `anladinmi.ui.fontSize` | `normal` | Yazı boyutu: `kucuk` / `normal` / `buyuk` |
| `anladinmi.ui.showWrongExplanations` | `true` | Yanlış şıkların açıklamalarını göster |

Ayarlar **Eklentiler sekmesinde** eklentinin kendi sayfasında:

- Eklentinin **⚙** menüsü → **Görünüm ve ayarlar**: canlı önizlemeli ayarlar sayfası.
- Eklenti sayfasındaki **Özellikler → Ayarlar** sekmesi ya da ⚙ → **Ayarlar**: VS Code'un kendi ayar listesi
  (*Görünüm* ve *Quiz ve bağlantı* başlıkları altında).

Komut Paleti → `Anladın mı?: Görünüm ve ayarlar` da aynı sayfayı açar. Görünüm değişiklikleri açık
quiz'e canlı uygulanır; quiz ekranında ayar butonu yoktur.

Backend'e ulaşılamazsa hata ekranında **Örnek sorularla dene** butonu çıkar.

## Geliştirme

```powershell
cd extension
npm install
npm run compile
npm run sahte-backend      # gerçek backend gibi davranır, Claude'a gitmez
```

- VS Code'da `extension/` klasörünü açıp **F5** → eklenti yeni bir pencerede çalışır.
- Paketlemek ve kurmak için:
  ```powershell
  npm run package
  code --install-extension anladin-mi-0.9.0.vsix --force
  ```
  Kodu değiştirip yeniden kurarken `package.json`'daki `version`'ı artır; aynı sürümde VS Code
  eski kodu bellekte tutar ve pencereyi yenilemeyi istemez.

`scripts/sahte-backend.js` gerçek backend'in biçimini taklit eder (Claude'a gitmez). Diff'te `YAVAS` geçerse
5 sn bekler, `HATA500` geçerse 502 döner, `BUYUK` geçerse `omitted_files` dolu gelir.

## Dosyalar

| Dosya | Görev |
|---|---|
| `src/extension.ts` | Komut ve akış: soru al → cevapla → değerlendir → commit |
| `src/git.ts` | Repo seçimi (VS Code git API), staged diff ve bağlam (git CLI), hook kurulumu |
| `src/sunucu.ts` | Hook köprüsü: yerel sunucu, token, "tamam"/"iptal" yanıtı |
| `src/backend.ts` | Backend istemcisi (+ mock), VS Code'a bağımlı değil |
| `src/quizPanel.ts` | Webview: soru, sonuç, hata ekranları |
| `src/ayarlarPanel.ts` | Webview: ayarlar sayfası (canlı önizlemeli) |
| `src/tema.ts` | Görünüm ayarları + iki ekranın ortak CSS'i |
| `scripts/sahte-backend.js` | Geliştirme için sahte backend |
