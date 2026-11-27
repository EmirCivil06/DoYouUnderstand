# Anladın mı? — VS Code eklentisi

Commit'lemeden önce, stage ettiğin değişiklik hakkında 2–3 soru sorar. Cevaplarını Claude
değerlendirir; eksik kalan yerleri **Türkçe**, yeni başlayan birine anlatır gibi açıklar.

**Kapı değil, öğretmen:** sonuç ne olursa olsun commit atabilirsin. Amaç engellemek değil,
commit'lediğin kodu anlamanı sağlamak.

## Kullanım

1. Değişikliklerini stage et (Kaynak Denetimi panelinde `+`).
2. Panelin üstündeki **🎓 Anladın mı? ile commit'le** butonuna bas
   (ya da Komut Paleti → `Anladın mı?: Anladın mı? ile commit'le`).
3. Soruları kendi cümlelerinle cevapla → **Cevapları gönder**.
4. Sonuçları ve dersleri oku → **Commit'le**.

Değişiklik önemsizse (sadece boşluk/yorum) backend soru üretmez, direkt commit ekranı gelir.

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
| `src/git.ts` | VS Code git API'si: repo seçimi, staged diff, bağlam, commit |
| `src/backend.ts` | Backend istemcisi (+ mock), VS Code'a bağımlı değil |
| `src/quizPanel.ts` | Webview: soru, sonuç, hata ekranları |
| `scripts/sahte-backend.js` | Geliştirme için sahte backend |
