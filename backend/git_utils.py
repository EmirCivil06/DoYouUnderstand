"""
git_utils.py - git komutlarını çalıştıran küçük yardımcılar.

main.py'nin kullanacağı fonksiyonlar:
    diff_al()          -> staged diff (str)
    commit_at(mesaj)   -> git commit çıktısı (str)
    repo_adi()         -> repo klasörünün adı (str)
    GitHatasi          -> yakalanacak hata
"""

import os
import subprocess


class GitHatasi(Exception):
    """main.py bunu yakalayıp str(hata) ile kullanıcıya gösterir."""


def komut_calistir(liste):
    """Komutu çalıştırır; hata olursa GitHatasi, yoksa stdout döndürür."""
    try:
        sonuc = subprocess.run(
            liste, capture_output=True, text=True, encoding="utf-8", errors="replace"
        )
    except FileNotFoundError:
        raise GitHatasi("git bulunamadı. Git kurulu mu?")
    if sonuc.returncode != 0:
        raise GitHatasi((sonuc.stderr or sonuc.stdout).strip() or "git komutu başarısız oldu.")
    return sonuc.stdout


def repo_mu():
    try:
        return komut_calistir(["git", "rev-parse", "--is-inside-work-tree"]).strip() == "true"
    except GitHatasi:
        return False


def diff_al():
    if not repo_mu():
        raise GitHatasi("Burası bir git reposu değil. Bir repo klasöründe çalıştır.")
    diff = komut_calistir([
        "git", "diff", "--staged", "--", ".",
        ":(exclude)*.lock", ":(exclude)package-lock.json",
    ])
    if not diff.strip():
        raise GitHatasi("Staged değişiklik yok. Önce git add yap.")
    return diff


def commit_at(mesaj):
    return komut_calistir(["git", "commit", "-m", mesaj])


def repo_adi():
    try:
        yol = komut_calistir(["git", "rev-parse", "--show-toplevel"]).strip()
    except GitHatasi:
        return ""
    return os.path.basename(os.path.normpath(yol))
