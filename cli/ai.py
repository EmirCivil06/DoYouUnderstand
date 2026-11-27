"""
ai.py - "Anladın mı?" : Commit'ten önce diff'ten soru üretir, cevabı değerlendirir,
yanlışta kısa Türkçe ders anlatır. Model: Claude Haiku.

main.py'nin kullanacağı fonksiyonlar:
    soru_uret(diff, adet=3, zorluk="orta")  -> [soru_dict, ...]
    cevap_kontrol(soru, cevap, diff)         -> sonuc_dict
    guvenlik_tara(diff)                      -> [(satir_no, tur, satir), ...]
    AIHatasi                                 -> yakalanacak hata

soru_dict:
    {
      "tip": "coktan" | "acik",
      "soru": "...",
      "secenekler": ["A) ...", "B) ...", "C) ...", "D) ..."],   # sadece coktan
      "dogru": "B",                                              # sadece coktan
      "aciklama": "Doğru cevabın kısa açıklaması",
      "konu": "hata yönetimi",                                   # ilerleme takibi için
      "dosya": "app/login.py"
    }

sonuc_dict:
    {"dogru": True/False, "geri_bildirim": "...", "ders": "..." }   # ders yanlışsa dolu

Gereken: pip install anthropic     Ortam değişkeni: ANTHROPIC_API_KEY
"""

import json
import os
import re

try:
    import anthropic
except ImportError:
    anthropic = None

MODEL = "claude-haiku-5-5"
MAX_DIFF = 15000


class AIHatasi(Exception):
    """main.py bunu yakalayıp str(hata) ile kullanıcıya gösterir."""


# ------------------------------------------------------------------ yardımcılar

def _istemci():
    if anthropic is None:
        raise AIHatasi("anthropic kütüphanesi yok. Çalıştır: pip install anthropic")
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise AIHatasi("ANTHROPIC_API_KEY ortam değişkeni ayarlı değil.")
    return anthropic.Anthropic()


def _kirp(metin, limit=MAX_DIFF):
    if len(metin) <= limit:
        return metin
    return metin[:limit] + f"\n\n[... diff çok uzun, {len(metin) - limit} karakter kırpıldı ...]"


def _sor(system, kullanici, max_tokens=1500):
    client = _istemci()
    try:
        cevap = client.messages.create(
            model=MODEL,
            max_tokens=max_tokens,
            system=system,
            thinking={"type": "disabled"},  # düşünme max_tokens'ı yiyip JSON'u yarıda kesiyordu
            messages=[{"role": "user", "content": kullanici}],
        )
    except anthropic.AuthenticationError:
        raise AIHatasi("API anahtarı geçersiz.")
    except anthropic.RateLimitError:
        raise AIHatasi("API kotası doldu, biraz bekleyip tekrar dene.")
    except anthropic.APIConnectionError:
        raise AIHatasi("Claude API'ye bağlanılamadı. İnternetini kontrol et.")
    except anthropic.APIError as e:
        raise AIHatasi(f"API hatası: {e}")
    return "".join(b.text for b in cevap.content if b.type == "text").strip()


def _json_cek(metin):
    """Cevaptan JSON'u çıkarır (```json ... ``` sarmalı olsa bile)."""
    metin = re.sub(r"^```(?:json)?\s*|\s*```$", "", metin.strip())
    try:
        return json.loads(metin)
    except json.JSONDecodeError:
        eslesme = re.search(r"(\{.*\}|\[.*\])", metin, re.S)
        if eslesme:
            try:
                return json.loads(eslesme.group(1))
            except json.JSONDecodeError:
                pass
    raise AIHatasi("Claude'un cevabı okunamadı, tekrar dene.")


# ------------------------------------------------------------------ soru üretme

ZORLUK = {
    "kolay": "Yüzeysel anlama: bu değişiklik ne yapıyor, hangi fonksiyon neyi döndürüyor.",
    "orta": "Davranış: belirli bir girdide ne olur, bu satır neden gerekli, ne kırılabilir.",
    "zor": "Derin: uç durumlar (boş, null, eşzamanlılık), performans, güvenlik, mimari etkiler.",
}

SORU_SYSTEM = """Sen sabırlı bir yazılım mentorusun. Öğrenci ve stajyerlere, commit etmek üzere oldukları
kodu (çoğu zaman bir AI yazmıştır) gerçekten anlayıp anlamadıklarını test ediyorsun.

Sana bir git diff verilecek. Bu diff'e ÖZGÜ sorular üret:
- Sorular genel bilgi değil, BU koddaki davranış hakkında olsun (fonksiyon/değişken adlarını kullan).
- Kodu okuyup anlayan biri cevaplayabilmeli; ezber gerektirmesin.
- Önemsiz değişiklikleri (boşluk, import sırası, yorum) soru konusu yapma.
- Çoktan seçmelilerde yanlış şıklar makul görünsün, tek bir doğru olsun.
- "konu" alanı kısa ve genel bir kavram olsun (örn: "hata yönetimi", "döngüler", "async",
  "veritabanı sorgusu", "girdi doğrulama", "API çağrısı", "uç durumlar").
- Her şey Türkçe olsun (kod parçaları hariç).

SADECE şu JSON'u döndür, başka hiçbir şey yazma:
{"sorular": [
  {"tip": "coktan", "soru": "...", "secenekler": ["A) ...", "B) ...", "C) ...", "D) ..."],
   "dogru": "B", "aciklama": "...", "konu": "...", "dosya": "..."},
  {"tip": "acik", "soru": "...", "aciklama": "beklenen cevabın özü", "konu": "...", "dosya": "..."}
]}"""


def soru_uret(diff, adet=3, zorluk="orta"):
    """diff -> soru listesi. Son soru açık uçlu, diğerleri çoktan seçmeli."""
    if not diff.strip():
        raise AIHatasi("Diff boş, sorulacak bir şey yok.")
    zorluk = zorluk if zorluk in ZORLUK else "orta"
    istek = (
        f"{adet} soru üret: {max(adet - 1, 1)} tanesi çoktan seçmeli, son 1 tanesi açık uçlu"
        f"{'' if adet > 1 else ' (tek soru olduğu için çoktan seçmeli yap)'}.\n"
        f"Zorluk: {zorluk} — {ZORLUK[zorluk]}\n\n<diff>\n{_kirp(diff)}\n</diff>"
    )
    veri = _json_cek(_sor(SORU_SYSTEM, istek))
    sorular = veri.get("sorular", veri) if isinstance(veri, dict) else veri

    temiz = []
    for s in sorular if isinstance(sorular, list) else []:
        if not isinstance(s, dict) or not s.get("soru"):
            continue
        s.setdefault("konu", "genel")
        s.setdefault("dosya", "")
        s.setdefault("aciklama", "")
        if s.get("tip") == "coktan":
            if not s.get("secenekler") or not s.get("dogru"):
                continue
            s["dogru"] = str(s["dogru"]).strip().upper()[:1]
        else:
            s["tip"] = "acik"
        temiz.append(s)
    if not temiz:
        raise AIHatasi("Claude geçerli soru üretemedi, tekrar dene.")
    return temiz[:adet]


# ------------------------------------------------------------------ cevap kontrol

DEGERLENDIR_SYSTEM = """Sen sabırlı bir yazılım mentorusun. Öğrencinin, kendi commit'indeki kodla ilgili
açık uçlu bir soruya verdiği cevabı değerlendiriyorsun.

- Anlamış olduğunu gösteriyorsa doğru say; mükemmel ifade bekleme, hoşgörülü ol.
- Yanlış ya da eksikse kısa bir DERS yaz: kavramı basitçe açıkla, diff'teki ilgili satıra
  atıf yap, en fazla 5 cümle. Azarlama, cesaretlendir.
- Türkçe yaz.

SADECE şu JSON'u döndür:
{"dogru": true, "geri_bildirim": "1 cümle", "ders": ""}"""

DERS_SYSTEM = """Sen sabırlı bir yazılım mentorusun. Öğrenci, kendi commit'indeki kodla ilgili çoktan
seçmeli bir soruyu yanlış cevapladı. Kısa bir DERS yaz:
- Neden seçtiği şık yanlış, doğrusu neden doğru
- Arkadaki kavramı basitçe anlat, diff'teki ilgili satıra atıf yap
- En fazla 5 cümle, Türkçe, cesaretlendirici. Sadece dersi yaz, başlık ekleme."""


def cevap_kontrol(soru, cevap, diff):
    """Çoktan seçmeliyi yerelde kontrol eder; yanlışsa ders ister.
    Açık uçluyu Claude'a değerlendirtir."""
    cevap = (cevap or "").strip()

    if soru["tip"] == "coktan":
        dogru_mu = cevap.upper()[:1] == soru["dogru"]
        if dogru_mu:
            return {"dogru": True, "geri_bildirim": soru.get("aciklama", ""), "ders": ""}
        istek = (
            f"Soru: {soru['soru']}\nŞıklar: {' | '.join(soru['secenekler'])}\n"
            f"Öğrencinin cevabı: {cevap or '(boş)'}\nDoğru cevap: {soru['dogru']}\n"
            f"Not: {soru.get('aciklama', '')}\n\n<diff>\n{_kirp(diff, 6000)}\n</diff>"
        )
        return {
            "dogru": False,
            "geri_bildirim": f"Doğru cevap: {soru['dogru']}",
            "ders": _sor(DERS_SYSTEM, istek, max_tokens=500),
        }

    if not cevap:
        cevap = "(boş bıraktı)"
    istek = (
        f"Soru: {soru['soru']}\nBeklenen cevabın özü: {soru.get('aciklama', '')}\n"
        f"Öğrencinin cevabı: {cevap}\n\n<diff>\n{_kirp(diff, 6000)}\n</diff>"
    )
    veri = _json_cek(_sor(DEGERLENDIR_SYSTEM, istek, max_tokens=600))
    return {
        "dogru": bool(veri.get("dogru")),
        "geri_bildirim": veri.get("geri_bildirim", ""),
        "ders": veri.get("ders", "") if not veri.get("dogru") else "",
    }


# ------------------------------------------------------------------ güvenlik taraması
# API gerektirmez. Diff'i Claude'a göndermeden ÖNCE çağır.

GIZLI_DESENLER = [
    ("Anthropic API anahtarı", r"sk-ant-[A-Za-z0-9_\-]{10,}"),
    ("OpenAI API anahtarı", r"sk-[A-Za-z0-9]{20,}"),
    ("AWS erişim anahtarı", r"AKIA[0-9A-Z]{16}"),
    ("GitHub token", r"gh[pousr]_[A-Za-z0-9]{30,}"),
    ("Özel anahtar (private key)", r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    ("Şifre ataması", r"(?i)(password|passwd|sifre|şifre|secret)\s*[:=]\s*['\"][^'\"]{4,}['\"]"),
]


def guvenlik_tara(diff):
    """Sadece EKLENEN satırları tarar."""
    bulunanlar = []
    for no, satir in enumerate(diff.splitlines(), 1):
        if not satir.startswith("+") or satir.startswith("+++"):
            continue
        for tur, desen in GIZLI_DESENLER:
            if re.search(desen, satir):
                bulunanlar.append((no, tur, satir[1:].strip()[:100]))
                break
    return bulunanlar
