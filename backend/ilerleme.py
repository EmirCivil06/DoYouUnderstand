"""
ilerleme.py - Öğrenme modu: her cevabı kaydeder, konu bazında güçlü/zayıf yönleri çıkarır.
Veriler ~/.anladinmi/gecmis.json dosyasında tutulur (API gerektirmez).

main.py'nin kullanacağı fonksiyonlar:
    kaydet(soru, dogru_mu, repo="")   -> her cevaptan sonra çağır
    rapor()                           -> {"toplam", "dogru", "oran", "konular": [...], "zayif": [...], "seri"}
"""

import json
import os
from datetime import datetime

KLASOR = os.path.join(os.path.expanduser("~"), ".anladinmi")
DOSYA = os.path.join(KLASOR, "gecmis.json")


def _yukle():
    try:
        with open(DOSYA, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def _yaz(kayitlar):
    os.makedirs(KLASOR, exist_ok=True)
    with open(DOSYA, "w", encoding="utf-8") as f:
        json.dump(kayitlar, f, ensure_ascii=False, indent=2)


def kaydet(soru, dogru_mu, repo=""):
    kayitlar = _yukle()
    kayitlar.append({
        "tarih": datetime.now().isoformat(timespec="seconds"),
        "konu": soru.get("konu", "genel").lower(),
        "tip": soru.get("tip", ""),
        "dogru": bool(dogru_mu),
        "repo": repo,
    })
    _yaz(kayitlar)


def rapor():
    kayitlar = _yukle()
    toplam = len(kayitlar)
    dogru = sum(k["dogru"] for k in kayitlar)

    konular = {}
    for k in kayitlar:
        d = konular.setdefault(k["konu"], {"konu": k["konu"], "toplam": 0, "dogru": 0})
        d["toplam"] += 1
        d["dogru"] += k["dogru"]
    for d in konular.values():
        d["oran"] = round(100 * d["dogru"] / d["toplam"])
    liste = sorted(konular.values(), key=lambda d: (d["oran"], -d["toplam"]))

    seri = 0  # sondan geriye üst üste doğru sayısı
    for k in reversed(kayitlar):
        if not k["dogru"]:
            break
        seri += 1

    return {
        "toplam": toplam,
        "dogru": dogru,
        "oran": round(100 * dogru / toplam) if toplam else 0,
        "konular": liste,
        "zayif": [d["konu"] for d in liste if d["oran"] < 60 and d["toplam"] >= 2][:3],
        "seri": seri,
    }
