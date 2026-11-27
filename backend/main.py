"""
main.py - anladınmı CLI

    python main.py          -> staged diff'ten quiz, sonunda commit (isteğe bağlı)
    python main.py rapor    -> konu bazında ilerleme raporu
    python main.py kur      -> bu repoya pre-commit hook kurar
    python main.py kaldir   -> hook'u kaldırır
    (python main.py hook    -> hook'un kendisi çağırır; commit'i git atar)
"""

import os
import sys

import ai
import arayuz
import git_utils
import ilerleme
from git_utils import GitHatasi

HOOK_ISARET = "# anladinmi-hook"


def sor(metin):
    """input() ama Ctrl+C / Ctrl+D programı çökertmesin."""
    try:
        return input(metin).strip()
    except EOFError:
        return ""


def evet_mi(metin):
    return sor(metin).lower() in ("e", "evet", "y", "yes")


# ------------------------------------------------------------------ quiz

def quiz(hook_modu=False):
    """Çıkış kodu döndürür. Hook modunda 1 = commit'i durdur."""
    try:
        diff = git_utils.diff_al()
    except GitHatasi as e:
        print(f"Hata: {e}")
        return 0 if hook_modu else 1

    bulgular = ai.guvenlik_tara(diff)
    if bulgular:
        print("⚠ Diff'te gizli bilgi olabilir:")
        for no, tur, satir in bulgular:
            print(f"  satır {no}: {tur} -> {satir}")
        if not evet_mi("Devam edilsin mi? Diff Claude'a gönderilecek. (e/h): "):
            print("Durduruldu. Gizli bilgiyi kaldırıp tekrar dene.")
            return 1

    zorluk = sor("Zorluk (kolay/orta/zor, Enter=orta): ").lower() or "orta"
    if zorluk not in ai.ZORLUK:
        print(f"'{zorluk}' tanınmadı, orta seçildi.")
        zorluk = "orta"

    print("Claude soruları hazırlıyor...")
    try:
        sorular = ai.soru_uret(diff, adet=3, zorluk=zorluk)
    except ai.AIHatasi as e:
        print(f"Hata: {e}")
        return 0 if hook_modu else 1

    repo = git_utils.repo_adi()
    dogru = 0
    for no, soru in enumerate(sorular, 1):
        arayuz.soru_goster(soru, no, len(sorular))
        ipucu = "Cevabın (A/B/C/D): " if soru["tip"] == "coktan" else "Cevabın: "
        cevap = sor(ipucu)
        if soru["tip"] == "acik" or cevap.upper()[:1] != soru["dogru"]:  # API çağrısı olacak
            print("Değerlendiriliyor...")
        try:
            sonuc = ai.cevap_kontrol(soru, cevap, diff)
        except ai.AIHatasi as e:
            print(f"Hata: {e} (bu soru atlandı)")
            continue
        arayuz.sonuc_goster(sonuc)
        ilerleme.kaydet(soru, sonuc["dogru"], repo=repo)
        dogru += sonuc["dogru"]

    arayuz.skor_goster(dogru, len(sorular))

    if hook_modu:
        return 0  # öğrenme aracıyız: commit'i engellemiyoruz

    mesaj = sor("\nCommit mesajı (boş = atla): ")
    if mesaj:
        try:
            print(git_utils.commit_at(mesaj).strip())
        except GitHatasi as e:
            print(f"Commit atılamadı: {e}")
            return 1
    else:
        print("Commit atlandı.")
    return 0


# ------------------------------------------------------------------ rapor

def rapor():
    try:
        from rapor import rapor_goster
    except ImportError:
        rapor_goster = None
    if rapor_goster:
        rapor_goster()
        return 0

    r = ilerleme.rapor()
    if not r["toplam"]:
        print("Henüz kayıt yok. Önce bir quiz çöz: python main.py")
        return 0
    print(f"Toplam: {r['dogru']}/{r['toplam']} doğru (%{r['oran']}), seri: {r['seri']}")
    print("Konular:")
    for k in r["konular"]:
        print(f"  {k['konu']}: {k['dogru']}/{k['toplam']} (%{k['oran']})")
    if r["zayif"]:
        print("Zayıf konular: " + ", ".join(r["zayif"]))
    return 0


# ------------------------------------------------------------------ hook

def _hook_yolu():
    klasor = git_utils.komut_calistir(["git", "rev-parse", "--git-path", "hooks"]).strip()
    return os.path.normpath(os.path.join(klasor, "pre-commit"))


def kur():
    try:
        yol = _hook_yolu()
    except GitHatasi:
        print("Burası bir git reposu değil.")
        return 1
    if os.path.exists(yol):
        with open(yol, encoding="utf-8", errors="replace") as f:
            if HOOK_ISARET not in f.read():
                print(f"Zaten başka bir pre-commit hook var, dokunmadım: {yol}")
                return 1
    python = sys.executable.replace("\\", "/")
    script = os.path.abspath(__file__).replace("\\", "/")
    icerik = (
        "#!/bin/sh\n"
        f"{HOOK_ISARET}\n"
        "# Terminal yoksa (ör. IDE'den commit) quiz'i atla, commit'e engel olma.\n"
        "if (exec < /dev/tty) 2>/dev/null; then\n"
        f'  exec "{python}" "{script}" hook < /dev/tty\n'
        "fi\n"
        "exit 0\n"
    )
    os.makedirs(os.path.dirname(yol), exist_ok=True)
    with open(yol, "w", encoding="utf-8", newline="\n") as f:
        f.write(icerik)
    os.chmod(yol, 0o755)
    print(f"Hook kuruldu: {yol}\nArtık her 'git commit' öncesi quiz gelecek.")
    return 0


def kaldir():
    try:
        yol = _hook_yolu()
    except GitHatasi:
        print("Burası bir git reposu değil.")
        return 1
    if not os.path.exists(yol):
        print("Kurulu hook yok.")
        return 0
    with open(yol, encoding="utf-8", errors="replace") as f:
        if HOOK_ISARET not in f.read():
            print("Bu hook anladınmı'ya ait değil, dokunmadım.")
            return 1
    os.remove(yol)
    print("Hook kaldırıldı.")
    return 0


# ------------------------------------------------------------------ giriş

def main():
    for akim in (sys.stdout, sys.stderr):
        try:
            akim.reconfigure(encoding="utf-8", errors="replace")
        except AttributeError:
            pass

    komut = sys.argv[1] if len(sys.argv) > 1 else ""
    komutlar = {
        "": quiz,
        "rapor": rapor,
        "kur": kur,
        "kaldir": kaldir,
        "hook": lambda: quiz(hook_modu=True),
    }
    if komut not in komutlar:
        print(__doc__)
        return 1
    try:
        return komutlar[komut]()
    except KeyboardInterrupt:
        print("\nİptal edildi.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
