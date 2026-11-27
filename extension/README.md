# Anladın mı? — VS Code eklentisi

Commit'lemeden önce, stage ettiğin değişiklik hakkında 2–3 soru sorar. Cevaplarını Claude
değerlendirir; eksik kalan yerleri **Türkçe**, yeni başlayan birine anlatır gibi açıklar.

**Kapı değil, öğretmen:** sonuç ne olursa olsun commit atabilirsin. Amaç engellemek değil,
commit'lediğin kodu anlamanı sağlamak.

## Kullanım

Değişikliklerini stage et (Kaynak Denetimi panelinde `+`), sonra her zamanki gibi commit'le:

- **Mavi Commit butonu** (ya da terminalde `git commit`): repo açılınca eklenti bir kez
  *"Commit butonuna basınca da quiz açılsın mı?"* diye sorar. "Evet, bağla" dersen repoya bir
  pre-commit hook kurulur; commit'e her basışta quiz kendiliğinden açılır, bitirince commit devam eder.
- **Commit kutusunda `Ctrl+Enter`**, panelin üstündeki **🎓** butonu ya da Komut Paleti →
  `Anladın mı? ile commit'le`: quiz açılır, sonunda commit'i eklenti atar.

Sorular **tek tek** gelir (`Ctrl+Enter` = sonraki soru). Son sorudan sonra hepsi birlikte
değerlendirilir; yanlışlar için kısa bir **Ders** gösterilir. Sonuç ne olursa olsun commit
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

Sözleşme: `backend/CLAUDE.md` bölüm 4 (`GET /health`, `POST /questions`, `POST /evaluate`).
Eklenti `expected_points` alanını asla göstermez; backend unutsa bile istemci ayıklar.

## Ayarlar

| Ayar | Varsayılan | Açıklama |
|---|---|---|
| `anladinmi.backendUrl` | `http://127.0.0.1:8765` | Backend adresi |
| `anladinmi.difficulty` | `orta` | `kolay` / `orta` / `zor` |
| `anladinmi.numQuestions` | `3` | 1–5 |
| `anladinmi.mockMode` | `false` | Backend'e hiç gitmeden örnek sorular (çevrimdışı demo) |

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
  code --install-extension anladin-mi-0.1.0.vsix --force
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
| `scripts/sahte-backend.js` | Geliştirme için sahte backend |
