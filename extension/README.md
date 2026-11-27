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

**3 soru**, her biri **5 şıklı ve tek doğru cevaplı**, **tek tek** gelir (`A`–`E` ya da `1`–`5`
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

Sözleşme: `backend/CLAUDE.md` bölüm 4 (`GET /health`, `POST /questions`, `POST /evaluate`) +
aşağıdaki çoktan seçmeli eki. Eklenti sorular için yalnızca `id, question, file, line_hint, topic,
options` alanlarını alır (beyaz liste): `expected_points`, doğru şık ya da açıklama yanlışlıkla
gönderilse bile cevaplamadan önce asla gösterilmez.

## Backend sözleşmesi: çoktan seçmeli eki (backend'e iletilecek)

Eklenti artık **3 soru, her biri 5 şıklı, tek doğru cevaplı** çoktan seçmeli soru istiyor.
Ek geriye uyumlu: backend `options` göndermezse eklenti eski açık uçlu ekranı gösterir.

**`POST /questions` isteğinde `params`'a iki alan eklendi** (pydantic bilmediği alanı zaten yok sayar):

```json
"params": { "num_questions": 3, "difficulty": "orta", "language": "tr", "focus_topics": [],
            "question_type": "multiple_choice", "num_options": 5 }
```

**Yanıttaki her soruya `options` eklendi.** Doğru şık ve açıklamalar yanıtta **yok**; backend
bunları `session_id` altında saklar (`expected_points` gibi):

```json
{ "id": "q1", "question": "`ortalama_fiyat({})` çağrılırsa ne olur?", "file": "sepet.py",
  "line_hint": 24, "topic": "uç durumlar",
  "options": [ {"id": "A", "text": "`0` döndürür"}, {"id": "B", "text": "`None` döndürür"},
               {"id": "C", "text": "`ZeroDivisionError` hatası verir"}, {"id": "D", "text": "`KeyError` hatası verir"},
               {"id": "E", "text": "`nan` döndürür"} ] }
```

**`POST /evaluate` isteği aynı**; `answer` artık seçilen şıkkın id'si: `{"question_id": "q1", "answer": "C"}`.
**Önemli:** eklenti her soru cevaplanınca **hemen** `/evaluate` çağırır ve `answers` listesinde **yalnızca o
soru** olur (aynı `session_id` ile 3 ayrı istek). Backend sadece gönderilen soruları değerlendirip
`results`'ta sadece onları döndürmeli; oturum ilk değerlendirmeden sonra silinmemeli.
Çoktan seçmeli değerlendirme için Claude'a gerek yok, backend doğru şıkla karşılaştırır (bedava).

**Yanıttaki her sonuca iki alan eklendi:**

```json
{ "question_id": "q1", "correct": false, "score": 0,
  "feedback": "Senin cevabın A, doğru cevap C.",
  "explanation": "Boş sepette `sum(...)` 0 olur ve 0'a bölme `ZeroDivisionError` verir.",
  "correct_option": "C",
  "option_explanations": { "A": "Bunun için boş sepet kontrolü gerekirdi; kod doğrudan bölüyor.",
                           "B": "...", "D": "...", "E": "..." } }
```

- `explanation`: doğru şık **neden doğru** (her zaman dolu).
- `option_explanations`: her **yanlış** şık **aslında ne yapar / neden yanlış** (doğru şık hariç 4 tane).
- Claude'dan soru üretirken hepsi tek seferde istenebilir (soru + 5 şık + doğru şık + 5 açıklama);
  `score` 1 ya da 0, geçme kuralı aynı.

Örnek veri: `src/ornekSorular.ts` (mock ve sahte backend bunu kullanıyor).

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

Hepsini tek sayfadan değiştirmek için: quiz ekranındaki **⚙ Ayarlar**, Kaynak Denetimi panelinin
`…` menüsü ya da Komut Paleti → `Anladın mı?: Ayarlar`. Görünüm değişiklikleri açık quiz'e canlı uygulanır.

Backend'e ulaşılamazsa hata ekranında **Örnek sorularla dene** butonu çıkar.

## Geliştirme

```powershell
cd extension
npm install
npm run compile
npm run sahte-backend      # sözleşmeye uyan sahte backend, Claude'a gitmez
```

- VS Code'da `extension/` klasörünü açıp **F5** → eklenti yeni bir pencerede çalışır.
- Paketlemek ve kurmak için:
  ```powershell
  npm run package
  code --install-extension anladin-mi-0.6.0.vsix --force
  ```
  Kodu değiştirip yeniden kurarken `package.json`'daki `version`'ı artır; aynı sürümde VS Code
  eski kodu bellekte tutar ve pencereyi yenilemeyi istemez.
  ```powershell
  ```

`scripts/sahte-backend.js` ile hata ekranlarını da deneyebilirsin: diff'te `YAVAS` geçerse
5 sn bekler, `HATA500` geçerse 502 döner.

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
