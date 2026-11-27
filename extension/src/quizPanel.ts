// Quiz ekranı (webview). Eklenti soruları ve her sorunun sonucunu yollar; webview çizer ve olay yollar.
// Akış: soru -> cevabı kontrol et -> o sorunun doğru cevabı + açıklamaları -> sonraki soru -> ... -> özet.
import * as crypto from "crypto";
import * as vscode from "vscode";
import type { Soru, Sonuc } from "./backend";
import { gomJson, ORTAK_CSS, Tema, TEMA_JS, temaOku, VARSAYILAN_TEMA } from "./tema";

/**
 * "buton": kullanıcı eklentiden başlattı, commit'i eklenti atar (mesaj sorulur).
 * "hook":  git commit zaten sürüyor (mavi buton / terminal); eklenti sadece "devam" ya da "iptal" der.
 */
export type Mod = "buton" | "hook";

/** Eklenti -> webview */
export type Gorunum =
  | { tip: "yukleniyor"; metin: string }
  | { tip: "sorular"; mod: Mod; sorular: Soru[]; baslik: Baslik; commitMesaji: string }
  | { tip: "sorusuz"; mod: Mod; baslik: Baslik; commitMesaji: string }
  | { tip: "soruSonucu"; soruId: string; sonuc?: Sonuc; hata?: string }
  | { tip: "commitlendi"; mesaj: string }
  | { tip: "hookBitti"; devam: boolean }
  | { tip: "hata"; mod: Mod; metin: string; mockTeklifi: boolean }
  | { tip: "tema"; tema: Tema }; // ayarlar değişince canlı uygulanır

export interface Baslik {
  repo: string;
  branch: string;
  dosyaSayisi: number;
  mock: boolean;
}

/** Webview -> eklenti */
export type Olay =
  | { tip: "kontrol"; soruId: string; cevap: string } // tek bir sorunun cevabını değerlendir
  | { tip: "commit"; mesaj: string } //                 buton modu
  | { tip: "devam" } //                                 hook modu: commit sürsün
  | { tip: "iptal" } //                                 hook modu: commit iptal
  | { tip: "tekrar" }
  | { tip: "mockIleDene" }
  | { tip: "kapat" }
  | { tip: "ayarlar" }; //                              ⚙ butonu

export class QuizPanel {
  private static aktif: QuizPanel | undefined;
  private dinleyici: ((o: Olay) => void) | undefined;
  private kapaninca: (() => void) | undefined;

  static goster(): QuizPanel {
    if (QuizPanel.aktif) {
      QuizPanel.aktif.panel.reveal(vscode.ViewColumn.Active);
      return QuizPanel.aktif;
    }
    const panel = vscode.window.createWebviewPanel("anladinmi.quiz", "Anladın mı?", vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
    });
    QuizPanel.aktif = new QuizPanel(panel);
    return QuizPanel.aktif;
  }

  private constructor(private readonly panel: vscode.WebviewPanel) {
    panel.webview.html = html(crypto.randomBytes(16).toString("base64"), temaOku());
    panel.webview.onDidReceiveMessage((o: Olay) => {
      if (o.tip === "kapat") panel.dispose();
      else if (o.tip === "ayarlar") void vscode.commands.executeCommand("anladinmi.openSettings");
      else this.dinleyici?.(o);
    });
    panel.onDidDispose(() => {
      QuizPanel.aktif = undefined;
      this.kapaninca?.();
    });
  }

  /** Yeni bir oturum paneli devralır: eski dinleyiciler bırakılır. */
  baglan(dinleyici: (o: Olay) => void, kapaninca: () => void) {
    this.dinleyici = dinleyici;
    this.kapaninca = kapaninca;
  }

  /** Görünüm ayarları değişti: açık quiz ekranına hemen uygula. */
  static temaYenile() {
    QuizPanel.aktif?.ciz({ tip: "tema", tema: temaOku() });
  }

  ciz(g: Gorunum) {
    void this.panel.webview.postMessage(g);
  }

  kapat() {
    this.panel.dispose();
  }
}

export function html(nonce: string, tema: Tema = VARSAYILAN_TEMA): string {
  return /* html */ `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style nonce="${nonce}">
  ${ORTAK_CSS}
  header { margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
  .alt { color: var(--soluk); font-size: .95em; display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; }
  .rozet { font-size: .78em; padding: 1px 8px; border-radius: 10px; border: 1px solid var(--kenar); color: var(--soluk); }
  .rozet.mock { border-color: var(--vscode-editorWarning-foreground); color: var(--vscode-editorWarning-foreground); }
  .ust { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-bottom: 6px; }
  .no { font-weight: 600; font-size: .85em; text-transform: uppercase; letter-spacing: .06em; color: var(--soluk); }
  .konu { font-size: .8em; padding: 1px 8px; border-radius: 10px;
          background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
  .dosya { font-family: var(--vscode-editor-font-family); font-size: .85em; color: var(--soluk); margin-bottom: 8px; }
  .soru { font-size: 1.1em; margin: 0 0 12px; }
  textarea { min-height: 96px; resize: vertical; }
  label.baslik { display: block; font-size: .9em; color: var(--soluk); margin: 18px 0 6px; }
  .butonlar { display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap; align-items: center; }
  .butonlar.orta { justify-content: center; }
  .bosluk { flex: 1; }
  .adimlar { display: flex; gap: 6px; margin: 0 0 16px; }
  .adimlar span { flex: 1; height: 4px; border-radius: 2px; background: var(--kenar); }
  .adimlar span.simdi { background: var(--vurgu); }
  .adimlar span.d { background: var(--iyi); }
  .adimlar span.y { background: var(--kotu); }
  .ipucu { color: var(--soluk); font-size: .85em; margin-top: 8px; }
  #ayarlarAc { flex: none; font-size: .9em; }

  .karar { margin: 0 0 10px; font-weight: 600; }
  .karar.dogru { color: var(--iyi); } .karar.yanlis { color: var(--kotu); }
  .cevabin { color: var(--soluk); font-size: .92em; margin: 0 0 8px; white-space: pre-wrap; }
  .ders { margin-top: 10px; padding: 10px 12px; border-radius: 6px;
          background: var(--vscode-textBlockQuote-background); border-left: 3px solid var(--vscode-textLink-foreground); }
  .ders b.baslik { display: block; font-size: .8em; text-transform: uppercase; letter-spacing: .06em; color: var(--soluk); margin-bottom: 4px; }
  .satir-hata { color: var(--kotu); margin-top: 10px; }

  .yukleniyor { display: flex; align-items: center; gap: 12px; color: var(--soluk); padding: 40px 0; justify-content: center; }
  .donen { width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--kenar);
           border-top-color: var(--vurgu); animation: don 0.8s linear infinite; }
  @keyframes don { to { transform: rotate(360deg); } }

  /* özet */
  .ozet { display: flex; align-items: center; gap: 18px; }
  .sayi { font-size: 2.2em; font-weight: 600; line-height: 1; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .sayi small { font-size: .45em; font-weight: 400; color: var(--soluk); }
  .ozet-liste { display: flex; flex-direction: column; gap: 8px; margin: 14px 0 0; }
  .ozet-satir { display: grid; grid-template-columns: 22px 1fr; gap: 10px; padding: 10px 12px; border-radius: 6px;
                border: 1px solid var(--kenar); }
  .ozet-satir .isaret { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center;
                        font-weight: 600; font-size: .85em; color: #fff; }
  .ozet-satir.dogru .isaret { background: var(--iyi); } .ozet-satir.yanlis .isaret { background: var(--kotu); }
  .ozet-satir .s { font-weight: 600; margin-bottom: 2px; }
  .ozet-satir .k { font-size: .9em; color: var(--soluk); }
  .ozet-satir .k b { color: var(--vscode-foreground); font-weight: 600; }
  .hata { border-left: 3px solid var(--kotu); }
  .kart.ozet-iyi { border: 2px solid var(--iyi); }
  .kart.ozet-kotu { border: 2px solid var(--kotu); }
  .bitti-ekran { text-align: center; padding: 36px 0; }
  .bitti-ekran .ikon { font-size: 2.2em; color: var(--iyi); }
  .not { color: var(--soluk); font-size: .9em; }
</style>
</head>
<body>
<main id="kok"><div class="yukleniyor"><div class="donen"></div>Hazırlanıyor…</div></main>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const kok = document.getElementById("kok");
  const gonder = (o) => vscode.postMessage(o);
  const $ = (id) => document.getElementById(id);
  const tikla = (id, f) => { const e = $(id); if (e) e.onclick = f; };
  ${TEMA_JS}
  temaUygula(${gomJson(tema)});
  // ⚙ her ekranın başlığında; tek dinleyiciyle yakala
  kok.addEventListener("click", (e) => { if (e.target.closest("#ayarlarAc")) gonder({ tip: "ayarlar" }); });
  const AYAR_BUTONU = '<button class="metin" id="ayarlarAc" title="Ayarlar">⚙ Ayarlar</button>';

  // Güvenli metin: önce HTML kaçır, sonra yalnızca \`kod\` ve **kalın** parçalarını biçimlendir.
  const kac = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const metin = (s) => kac(s)
    .replace(/\`([^\`]+)\`/g, "<code>$1</code>")
    .replace(/\\*\\*([^*]+)\\*\\*/g, "<b>$1</b>");

  let sonBaslik = null;
  function baslik(alt) {
    const b = sonBaslik;
    if (!b) return "<header><div><h1>Anladın mı?</h1></div>" + AYAR_BUTONU + "</header>";
    return \`<header><div><h1>Anladın mı?</h1><div class="alt">
      <span>\${kac(b.repo)}</span><span>⎇ \${kac(b.branch)}</span><span>\${b.dosyaSayisi} dosya</span>
      \${b.mock ? '<span class="rozet mock">örnek sorular · backend yok</span>' : ""}
      \${alt ? "<span>" + alt + "</span>" : ""}</div></div>\${AYAR_BUTONU}</header>\`;
  }

  // quiz = { mod, sorular, i, cevaplar: {id: "B"}, sonuclar: {id: Sonuc}, bekliyor, hata, commitMesaji }
  let quiz = null;
  let klavye = null; // aktif ekranın klavye kısayolları
  document.addEventListener("keydown", (e) => {
    if (!klavye || e.target.closest?.("input[type=text], textarea")) return;
    klavye(e);
  });

  const coktanMi = (s) => s.options && s.options.length > 0;
  const sikMetni = (s, id) => (s.options.find((o) => o.id === id) || { text: "" }).text;

  // ---------------------------------------------------------------- bir soru
  function adimCiz() {
    const { mod, sorular, i } = quiz;
    const s = sorular[i];
    const n = sorular.length;
    const son = i === n - 1;
    const sonuc = quiz.sonuclar[s.id];
    const secilen = quiz.cevaplar[s.id];

    const ilerleme = sorular.map((q, k) => {
      const r = quiz.sonuclar[q.id];
      return \`<span class="\${r ? (r.correct ? "d" : "y") : k === i ? "simdi" : ""}"></span>\`;
    }).join("");

    let govde;
    if (sonuc) {
      govde = coktanMi(s) ? sikSonucu(s, sonuc, secilen) : acikSonucu(s, sonuc, secilen);
    } else if (coktanMi(s)) {
      govde = \`<div class="secenekler" role="radiogroup">\${s.options.map((o) => \`
          <label class="secenek\${secilen === o.id ? " secili" : ""}" data-id="\${kac(o.id)}">
            <input type="radio" name="secenek" value="\${kac(o.id)}" \${secilen === o.id ? "checked" : ""}>
            <span class="harf">\${kac(o.id)}</span><span class="metin">\${metin(o.text)}</span>
          </label>\`).join("")}</div>
        <div class="ipucu"><kbd>A</kbd>–<kbd>\${kac(s.options[s.options.length - 1].id)}</kbd> ile seç, <kbd>Enter</kbd> ile kontrol et</div>\`;
    } else {
      govde = \`<textarea id="cevap" placeholder="Kendi cümlelerinle anlat. Emin değilsen tahminini yaz.">\${kac(secilen || "")}</textarea>
        <div class="ipucu"><kbd>Ctrl</kbd> + <kbd>Enter</kbd> ile kontrol et</div>\`;
    }

    const anaButon = sonuc
      ? \`<button id="ileri">\${son ? "Özeti gör" : "Sonraki soru"}</button>\`
      : \`<button id="kontrol" \${quiz.bekliyor ? "disabled" : ""}>\${quiz.bekliyor ? "Kontrol ediliyor…" : "Cevabı kontrol et"}</button>\`;

    kok.innerHTML = baslik(mod === "hook" ? "Commit bekliyor: önce birkaç soru." : "Commit'lemeden önce kısa bir kontrol.") +
      \`<div class="adimlar">\${ilerleme}</div>
      <section class="kart\${sonuc ? " cevaplandi" : ""}">
        <div class="ust"><span class="no">Soru \${i + 1} / \${n}</span><span class="konu">\${kac(s.topic)}</span></div>
        \${s.file ? \`<div class="dosya">\${kac(s.file)}\${s.line_hint ? ":" + s.line_hint : ""}</div>\` : ""}
        <p class="soru">\${metin(s.question)}</p>
        \${govde}
        \${quiz.hata ? \`<div class="satir-hata">\${metin(quiz.hata)}</div>\` : ""}
      </section>
      <div class="butonlar">
        \${anaButon}
        <span class="bosluk"></span>
        \${mod === "hook"
          ? '<button class="metin" id="atla">Quiz\\'i atla, commit\\'le</button><button class="ikincil" id="iptal">Commit\\'i iptal et</button>'
          : '<button class="ikincil" id="kapat">Vazgeç</button>'}
      </div>\`;

    tikla("atla", () => gonder({ tip: "devam" }));
    tikla("iptal", () => gonder({ tip: "iptal" }));
    tikla("kapat", () => gonder({ tip: "kapat" }));

    if (sonuc) {
      const ileri = () => { quiz.i++; if (quiz.i >= n) ozetCiz(); else adimCiz(); };
      tikla("ileri", ileri);
      $("ileri").focus();
      klavye = (e) => { if (e.key === "Enter") { e.preventDefault(); ileri(); } };
      window.scrollTo(0, 0);
      return;
    }

    const kontrolButonu = $("kontrol");
    const kontrol = () => {
      if (quiz.bekliyor) return;
      if (!coktanMi(s)) quiz.cevaplar[s.id] = $("cevap").value;
      const cevap = (quiz.cevaplar[s.id] || "").trim();
      if (coktanMi(s) && !cevap) return; // tek doğru şık var; seçmeden kontrol edilmez
      quiz.bekliyor = true; quiz.hata = null;
      adimCiz();
      gonder({ tip: "kontrol", soruId: s.id, cevap });
    };
    tikla("kontrol", kontrol);

    if (coktanMi(s)) {
      const sec = (id) => {
        if (quiz.bekliyor) return;
        quiz.cevaplar[s.id] = id;
        kok.querySelectorAll(".secenek").forEach((l) => {
          const evet = l.dataset.id === id;
          l.classList.toggle("secili", evet);
          l.querySelector("input").checked = evet;
        });
        kontrolButonu.disabled = false;
      };
      kok.querySelectorAll("label.secenek").forEach((l) => (l.onclick = (e) => { e.preventDefault(); sec(l.dataset.id); }));
      if (!quiz.bekliyor) kontrolButonu.disabled = !secilen;
      klavye = (e) => {
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        const hedef = s.options.find((o) => o.id.toUpperCase() === e.key.toUpperCase()) || s.options["12345".indexOf(e.key)];
        if (hedef) { e.preventDefault(); sec(hedef.id); }
        else if (e.key === "Enter") { e.preventDefault(); kontrol(); }
      };
      kontrolButonu.focus();
    } else {
      const t = $("cevap");
      t.focus(); t.setSelectionRange(t.value.length, t.value.length);
      t.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); kontrol(); } });
    }
  }

  /** Çoktan seçmeli sonuç: her şık; doğru olan neden doğru, yanlışlar aslında ne yapar. */
  function sikSonucu(s, r, secilen) {
    const dogruId = r.correct_option;
    const aciklamalar = r.option_explanations || {};
    return \`<p class="karar \${r.correct ? "dogru" : "yanlis"}">\${r.correct ? "✓ Doğru!" : "✗ Yanlış"}</p>
      <div class="secenekler">\${s.options.map((o) => {
      const dogru = o.id === dogruId;
      const benim = o.id === secilen;
      const sinif = dogru ? "dogru" : benim ? "yanlis" : "";
      const etiket = dogru && benim ? "Doğru cevap · senin cevabın" : dogru ? "Doğru cevap" : benim ? "Senin cevabın" : "";
      const aciklama = dogru ? r.explanation : aciklamalar[o.id];
      return \`<div class="secenek \${sinif}">
          <span class="harf">\${dogru ? "✓" : benim ? "✗" : kac(o.id)}</span>
          <div class="metin">\${metin(o.text)}\${etiket ? \`<span class="etiket">\${etiket}</span>\` : ""}
            \${aciklama ? \`<div class="aciklama">\${dogru ? "" : "<b>Aslında:</b> "}\${metin(aciklama)}</div>\` : ""}
          </div></div>\`;
    }).join("")}</div>\`;
  }

  /** Açık uçlu sonuç (backend options göndermezse). */
  function acikSonucu(s, r, cevap) {
    return \`<p class="karar \${r.correct ? "dogru" : "yanlis"}">\${r.correct ? "✓ Doğru!" : "✗ Yanlış"}</p>
      <p class="cevabin">Cevabın: \${kac(cevap || "(boş)")}</p>
      <p>\${metin(r.feedback)}</p>
      \${r.explanation ? \`<div class="ders"><b class="baslik">Ders</b>\${metin(r.explanation)}</div>\` : ""}\`;
  }

  // ---------------------------------------------------------------- özet
  function ozetCiz() {
    const { mod, sorular } = quiz;
    const n = sorular.length;
    const dogru = sorular.filter((s) => quiz.sonuclar[s.id]?.correct).length;
    const ozetMetni = dogru === n ? "Harika, bu değişikliği anlamışsın."
      : dogru === 0 ? "Bu değişikliği birlikte netleştirelim; açıklamalar yukarıdaki sorularda."
      : "Birkaç noktayı birlikte netleştirdik.";
    const satirlar = sorular.map((s, k) => {
      const r = quiz.sonuclar[s.id] || {};
      const secilen = quiz.cevaplar[s.id];
      let detay;
      if (coktanMi(s)) {
        detay = r.correct
          ? \`Cevabın: <b>\${kac(secilen)}</b> · \${metin(sikMetni(s, secilen))}\`
          : \`Cevabın: <b>\${kac(secilen)}</b> · \${metin(sikMetni(s, secilen))}<br>Doğru: <b>\${kac(r.correct_option)}</b> · \${metin(sikMetni(s, r.correct_option))}\`;
      } else {
        detay = \`Cevabın: \${kac(secilen || "(boş)")}\`;
      }
      return \`<div class="ozet-satir \${r.correct ? "dogru" : "yanlis"}">
        <span class="isaret">\${r.correct ? "✓" : "✗"}</span>
        <div><div class="s">\${k + 1}. \${metin(s.question)}</div><div class="k">\${detay}</div></div></div>\`;
    }).join("");

    kok.innerHTML = baslik() +
      // 3 sorudan 2+ doğru (en az üçte iki) -> yeşil çerçeve, yoksa kırmızı
      \`<section class="kart \${dogru * 3 >= n * 2 ? "ozet-iyi" : "ozet-kotu"}">
        <h2>Özet</h2>
        <div class="ozet"><div class="sayi">\${dogru} / \${n} <small>doğru</small></div><div>\${kac(ozetMetni)}</div></div>
        <div class="ozet-liste">\${satirlar}</div>
      </section>\` + bitisButonlari(mod, quiz.commitMesaji);
    bitisBagla(mod);
    window.scrollTo(0, 0);
  }

  // ---------------------------------------------------------------- bitiş butonları
  function bitisButonlari(mod, commitMesaji) {
    if (mod === "hook") {
      return \`<div class="butonlar"><button id="devam">Commit'i tamamla</button>
        <button class="ikincil" id="iptal">Commit'i iptal et</button></div>\`;
    }
    return \`<label class="baslik" for="mesaj">Commit mesajı</label>
      <input type="text" id="mesaj" value="\${kac(commitMesaji)}" placeholder="ör. sepet: indirim kodu eklendi">
      <div class="butonlar"><button id="commit">Commit'le</button>
        <button class="ikincil" id="kapat">Vazgeç</button></div>\`;
  }
  function bitisBagla(mod) {
    if (mod === "hook") {
      tikla("devam", () => gonder({ tip: "devam" }));
      tikla("iptal", () => gonder({ tip: "iptal" }));
      $("devam").focus();
      klavye = (e) => { if (e.key === "Enter") { e.preventDefault(); $("devam").click(); } };
      return;
    }
    const girdi = $("mesaj"), buton = $("commit");
    const guncelle = () => (buton.disabled = !girdi.value.trim());
    girdi.addEventListener("input", guncelle); guncelle();
    girdi.addEventListener("keydown", (e) => { if (e.key === "Enter" && !buton.disabled) buton.click(); });
    buton.onclick = () => { buton.disabled = true; gonder({ tip: "commit", mesaj: girdi.value.trim() }); };
    tikla("kapat", () => gonder({ tip: "kapat" }));
    if (!girdi.value) girdi.focus();
  }

  // ---------------------------------------------------------------- eklentiden gelen ekranlar
  const ciz = {
    yukleniyor(g) {
      kok.innerHTML = baslik() + \`<div class="yukleniyor"><div class="donen"></div>\${kac(g.metin)}</div>\`;
    },

    sorular(g) {
      sonBaslik = g.baslik;
      quiz = { mod: g.mod, sorular: g.sorular, i: 0, cevaplar: {}, sonuclar: {}, bekliyor: false, hata: null, commitMesaji: g.commitMesaji };
      adimCiz();
    },

    soruSonucu(g) {
      if (!quiz) return;
      quiz.bekliyor = false;
      if (g.sonuc) { quiz.sonuclar[g.soruId] = g.sonuc; quiz.hata = null; }
      else quiz.hata = g.hata || "Cevap kontrol edilemedi, tekrar dene.";
      adimCiz();
    },

    sorusuz(g) {
      sonBaslik = g.baslik;
      kok.innerHTML = baslik() +
        \`<section class="kart"><p class="soru">Bu değişiklik sadece biçim/yorum gibi önemsiz şeyler içeriyor, soracak bir şey yok.</p></section>\` +
        bitisButonlari(g.mod, g.commitMesaji);
      bitisBagla(g.mod);
    },

    commitlendi(g) {
      kok.innerHTML = baslik() +
        \`<div class="bitti-ekran"><div class="ikon">✓</div><p class="soru">Commit atıldı</p>
          <p class="not"><code>\${kac(g.mesaj)}</code></p>
          <div class="butonlar orta"><button class="ikincil" id="kapat">Kapat</button></div></div>\`;
      tikla("kapat", () => gonder({ tip: "kapat" }));
    },

    hookBitti(g) {
      kok.innerHTML = baslik() +
        \`<div class="bitti-ekran"><div class="ikon">\${g.devam ? "✓" : "✗"}</div>
          <p class="soru">\${g.devam ? "Commit devam ediyor" : "Commit iptal edildi"}</p>
          <div class="butonlar orta"><button class="ikincil" id="kapat">Kapat</button></div></div>\`;
      tikla("kapat", () => gonder({ tip: "kapat" }));
    },

    hata(g) {
      kok.innerHTML = baslik() +
        \`<section class="kart hata"><p class="soru">\${metin(g.metin)}</p></section>
          <div class="butonlar"><button id="tekrar">Tekrar dene</button>
          \${g.mockTeklifi ? '<button class="ikincil" id="mock">Örnek sorularla dene</button>' : ""}
          \${g.mod === "hook" ? '<button class="ikincil" id="devam">Quiz\\'siz commit\\'le</button>' : ""}
          <button class="ikincil" id="kapat">Kapat</button></div>\`;
      tikla("tekrar", () => gonder({ tip: "tekrar" }));
      tikla("mock", () => gonder({ tip: "mockIleDene" }));
      tikla("devam", () => gonder({ tip: "devam" }));
      tikla("kapat", () => gonder({ tip: "kapat" }));
    },
  };

  window.addEventListener("message", (e) => {
    const g = e.data;
    if (g.tip === "tema") return temaUygula(g.tema); // ekranı ve klavyeyi bozmadan
    klavye = null;
    if (ciz[g.tip]) ciz[g.tip](g);
  });
</script>
</body>
</html>`;
}
