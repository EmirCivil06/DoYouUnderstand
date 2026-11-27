"""
arayuz.py - TASLAK. Takım arkadaşı rich ile güzelleştirecek.
Fonksiyon isimleri ve parametreleri SABİT, main.py bunları çağırıyor.
"""


def soru_goster(soru, no, toplam):
    print(f"\n--- Soru {no}/{toplam} ({soru.get('konu', '')}) ---")
    if soru.get("dosya"):
        print(f"Dosya: {soru['dosya']}")
    print(soru["soru"])
    if soru["tip"] == "coktan":
        for secenek in soru["secenekler"]:
            print("  " + secenek)


def sonuc_goster(sonuc):
    print("✔ Doğru!" if sonuc["dogru"] else "✘ Yanlış.")
    if sonuc.get("geri_bildirim"):
        print(sonuc["geri_bildirim"])
    if sonuc.get("ders"):
        print("\nDers:\n" + sonuc["ders"])


def skor_goster(dogru, toplam):
    print(f"\nSkor: {dogru}/{toplam}")
