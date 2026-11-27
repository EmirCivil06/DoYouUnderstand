// Quiz ekranı (webview). Durumu eklenti tarafı yönetir; webview çizer ve olay yollar.
// Sorular TEK TEK gösterilir; son sorudan sonra hepsi birlikte değerlendirilir.
import * as crypto from "crypto";
import * as vscode from "vscode";
import type { DegerlendirmeYaniti, Soru } from "./backend";

/**
 * "buton": kullanıcı eklentiden başlattı, commit'i eklenti atar (mesaj sorulur).
 * "hook":  git commit zaten sürüyor (mavi buton / terminal); eklenti sadece "devam" ya da "iptal" der.
 */
export type Mod = "buton" | "hook";

/** Eklenti -> webview */
export type Gorunum =
  | { tip: "yukleniyor"; metin: string }
  | { tip: "sorular"; mod: Mod; sorular: Soru[]; baslik: Baslik }
  | { tip: "sorusuz"; mod: Mod; baslik: Baslik; commitMesaji: string }
  | { tip: "degerlendiriliyor" }
  | { tip: "sonuc"; mod: Mod; sorular: Soru[]; cevaplar: Record<string, string>; sonuc: DegerlendirmeYaniti; commitMesaji: string }
  | { tip: "commitlendi"; mesaj: string }
  | { tip: "hookBitti"; devam: boolean }
  | { tip: "hata"; mod: Mod; metin: string; mockTeklifi: boolean };

export interface Baslik {
  repo: string;
  branch: string;
  dosyaSayisi: number;
  mock: boolean;
}

/** Webview -> eklenti */
export type Olay =
  | { tip: "gonder"; cevaplar: Record<string, string> }
  | { tip: "commit"; mesaj: string } // buton modu
  | { tip: "devam" } //               hook modu: commit sürsün
  | { tip: "iptal" } //               hook modu: commit iptal
  | { tip: "tekrar" }
  | { tip: "mockIleDene" }
  | { tip: "kapat" };

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
    panel.webview.html = html(crypto.randomBytes(16).toString("base64"));
    panel.webview.onDidReceiveMessage((o: Olay) => {
      if (o.tip === "kapat") panel.dispose();
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

  ciz(g: Gorunum) {
    void this.panel.webview.postMessage(g);
  }

  kapat() {
    this.panel.dispose();
  }
}

export function html(nonce: string): string {
  return /* html */ `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style nonce="${nonce}">
  :root {
    --iyi: var(--vscode-testing-iconPassed, #3fb950);
    --kotu: var(--vscode-testing-iconFailed, #f85149);
    --kenar: var(--vscode-widget-border, var(--vscode-panel-border, rgba(128,128,128,.35)));
    --soluk: var(--vscode-descriptionForeground);
    --kart: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
    --vurgu: var(--vscode-progressBar-background, #0078d4);
  }
  * { box-sizing: border-box; }
  body {
    font-family: var(--vscode-font-family); font-size: var(--vscode-font-size);
    color: var(--vscode-foreground); background: var(--vscode-editor-background);
    margin: 0; padding: 28px 24px 48px; line-height: 1.55;
  }
  main { max-width: 720px; margin: 0 auto; }
  header { margin-bottom: 20px; }
  h1 { font-size: 1.6em; font-weight: 600; margin: 0 0 4px; letter-spacing: -.01em; }
  .alt { color: var(--soluk); font-size: .95em; display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; }
  .rozet { font-size: .78em; padding: 1px 8px; border-radius: 10px; border: 1px solid var(--kenar); color: var(--soluk); }
  .rozet.mock { border-color: var(--vscode-editorWarning-foreground); color: var(--vscode-editorWarning-foreground); }
  .kart {
    background: var(--kart); border: 1px solid var(--kenar); border-radius: 8px;
    padding: 18px 20px; margin-bottom: 14px;
  }
  .kart.dogru { border-left: 3px solid var(--iyi); }
  .kart.yanlis { border-left: 3px solid var(--kotu); }
  .ust { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-bottom: 6px; }
  .no { font-weight: 600; font-size: .85em; text-transform: uppercase; letter-spacing: .06em; color: var(--soluk); }
  .konu { font-size: .8em; padding: 1px 8px; border-radius: 10px;
          background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
  .dosya { font-family: var(--vscode-editor-font-family); font-size: .85em; color: var(--soluk); margin-bottom: 8px; }
  .soru { font-size: 1.1em; margin: 0 0 14px; }
  code { font-family: var(--vscode-editor-font-family); font-size: .92em; padding: 0 4px; border-radius: 3px;
         background: var(--vscode-textCodeBlock-background); }
  textarea, input[type=text] {
    width: 100%; font: inherit; color: var(--vscode-input-foreground); background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, var(--kenar)); border-radius: 4px; padding: 8px 10px;
  }
  textarea { min-height: 96px; resize: vertical; }
  textarea:focus, input:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
  label { display: block; font-size: .9em; color: var(--soluk); margin: 18px 0 6px; }
  .butonlar { display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap; align-items: center; }
  .butonlar.orta { justify-content: center; }
  .bosluk { flex: 1; }
  button {
    font: inherit; border: none; border-radius: 4px; padding: 7px 16px; cursor: pointer;
    background: var(--vscode-button-background); color: var(--vscode-button-foreground);
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.ikincil { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  button.ikincil:hover { background: var(--vscode-button-secondaryHoverBackground); }
  button.metin { background: none; color: var(--vscode-textLink-foreground); padding: 7px 6px; }
  button.metin:hover { text-decoration: underline; background: none; }
  button:disabled { opacity: .5; cursor: default; }
  .adimlar { display: flex; gap: 6px; margin: 0 0 16px; }
  .adimlar span { flex: 1; height: 4px; border-radius: 2px; background: var(--kenar); }
  .adimlar span.bitti { background: var(--vurgu); opacity: .55; }
  .adimlar span.simdi { background: var(--vurgu); }
  .ipucu { color: var(--soluk); font-size: .85em; margin-top: 8px; }
  .secenekler { display: flex; flex-direction: column; gap: 8px; }
  .secenek { display: flex; gap: 12px; align-items: flex-start; padding: 10px 12px; border-radius: 6px;
             border: 1px solid var(--kenar); background: var(--vscode-input-background); }
  label.secenek { cursor: pointer; position: relative; }
  label.secenek:hover { border-color: var(--vscode-focusBorder); }
  .secenek input { position: absolute; opacity: 0; pointer-events: none; }
  .secenek .harf { flex: none; width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center;
                   font-weight: 600; font-size: .9em; border: 1px solid var(--kenar); color: var(--soluk); }
  .secenek .metin { flex: 1; padding-top: 1px; }
  .secenek.secili { border-color: var(--vurgu); background: color-mix(in srgb, var(--vurgu) 12%, var(--vscode-input-background)); }
  .secenek.secili .harf { background: var(--vurgu); border-color: var(--vurgu); color: var(--vscode-button-foreground); }
  .sonuc .secenek { background: transparent; }
  .sonuc .secenek.dogru { border-color: var(--iyi); background: color-mix(in srgb, var(--iyi) 10%, transparent); }
  .sonuc .secenek.dogru .harf { background: var(--iyi); border-color: var(--iyi); color: #fff; }
  .sonuc .secenek.yanlis { border-color: var(--kotu); background: color-mix(in srgb, var(--kotu) 10%, transparent); }
  .sonuc .secenek.yanlis .harf { background: var(--kotu); border-color: var(--kotu); color: #fff; }
  .etiket { display: inline-block; margin-left: 8px; font-size: .78em; font-weight: 600; color: var(--soluk);
            text-transform: uppercase; letter-spacing: .04em; }
  .dogru .etiket { color: var(--iyi); } .yanlis .etiket { color: var(--kotu); }
  .aciklama { margin-top: 6px; font-size: .92em; color: var(--vscode-foreground); opacity: .85; }
  kbd { font-family: var(--vscode-editor-font-family); font-size: .85em; padding: 0 5px; border-radius: 3px;
        border: 1px solid var(--kenar); }
  .yukleniyor { display: flex; align-items: center; gap: 12px; color: var(--soluk); padding: 40px 0; justify-content: center; }
  .donen { width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--kenar);
           border-top-color: var(--vurgu); animation: don 0.8s linear infinite; }
  @keyframes don { to { transform: rotate(360deg); } }
  .ozet { display: flex; align-items: center; gap: 18px; }
  .sayi { font-size: 2.2em; font-weight: 600; line-height: 1; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .sayi small { font-size: .45em; font-weight: 400; color: var(--soluk); }
  .sonuc-adim { margin: 14px 0 6px; }
  .sonuc-adim span { height: 6px; }
  .sonuc-adim span.d { background: var(--iyi); }
  .sonuc-adim span.y { background: var(--kotu); }
  .cevabin { color: var(--soluk); font-size: .92em; margin: 0 0 8px; white-space: pre-wrap; }
  .geri { margin: 0; }
  .ders { margin-top: 12px; padding: 10px 12px; border-radius: 6px;
          background: var(--vscode-textBlockQuote-background); border-left: 3px solid var(--vscode-textLink-foreground); }
  .ders b.baslik { display: block; font-size: .8em; text-transform: uppercase; letter-spacing: .06em; color: var(--soluk); margin-bottom: 4px; }
  .durum { font-weight: 600; }
  .durum.dogru { color: var(--iyi); } .durum.yanlis { color: var(--kotu); }
  .hata { border-left: 3px solid var(--kotu); }
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

  // Güvenli metin: önce HTML kaçır, sonra yalnızca \`kod\` ve **kalın** parçalarını biçimlendir.
  const kac = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const metin = (s) => kac(s)
    .replace(/\`([^\`]+)\`/g, "<code>$1</code>")
    .replace(/\\*\\*([^*]+)\\*\\*/g, "<b>$1</b>");

  let sonBaslik = null;
  function baslik(alt) {
    const b = sonBaslik;
    if (!b) return "<header><h1>Anladın mı?</h1></header>";
    return \`<header><h1>Anladın mı?</h1><div class="alt">
      <span>\${kac(b.repo)}</span><span>⎇ \${kac(b.branch)}</span><span>\${b.dosyaSayisi} dosya</span>
      \${b.mock ? '<span class="rozet mock">örnek sorular · backend yok</span>' : ""}
      \${alt ? "<span>" + alt + "</span>" : ""}</div></header>\`;
  }

  // ---------------------------------------------------------------- sorular (tek tek)
  let quiz = null; // { mod, sorular, i, cevaplar }
  let klavye = null; // çoktan seçmeli adımda A–E / 1–5 / Enter kısayolları
  document.addEventListener("keydown", (e) => {
    if (!klavye || e.target.closest?.("input[type=text], textarea")) return;
    klavye(e);
  });

  function adimCiz() {
    const { mod, sorular, i, cevaplar } = quiz;
    const s = sorular[i];
    const n = sorular.length;
    const son = i === n - 1;
    const coktan = s.options && s.options.length > 0;
    const govde = coktan
      ? \`<div class="secenekler" role="radiogroup">\${s.options.map((o, k) => \`
          <label class="secenek\${cevaplar[s.id] === o.id ? " secili" : ""}" data-id="\${kac(o.id)}">
            <input type="radio" name="secenek" value="\${kac(o.id)}" \${cevaplar[s.id] === o.id ? "checked" : ""}>
            <span class="harf">\${kac(o.id)}</span><span class="metin">\${metin(o.text)}</span>
          </label>\`).join("")}</div>
          <div class="ipucu"><kbd>A</kbd>–<kbd>\${kac(s.options[s.options.length - 1].id)}</kbd> ile seç, <kbd>Enter</kbd> \${son ? "ile gönder" : "ile sonraki soru"}</div>\`
      : \`<textarea id="cevap" placeholder="Kendi cümlelerinle anlat. Emin değilsen tahminini yaz.">\${kac(cevaplar[s.id] || "")}</textarea>
          <div class="ipucu"><kbd>Ctrl</kbd> + <kbd>Enter</kbd> \${son ? "ile gönder" : "ile sonraki soru"}</div>\`;
    kok.innerHTML = baslik(mod === "hook" ? "Commit bekliyor: önce birkaç soru." : "Commit'lemeden önce kısa bir kontrol.") +
      \`<div class="adimlar">\${sorular.map((_, k) => \`<span class="\${k < i ? "bitti" : k === i ? "simdi" : ""}"></span>\`).join("")}</div>
      <section class="kart">
        <div class="ust"><span class="no">Soru \${i + 1} / \${n}</span><span class="konu">\${kac(s.topic)}</span></div>
        \${s.file ? \`<div class="dosya">\${kac(s.file)}\${s.line_hint ? ":" + s.line_hint : ""}</div>\` : ""}
        <p class="soru">\${metin(s.question)}</p>
        \${govde}
      </section>
      <div class="butonlar">
        \${i > 0 ? '<button class="ikincil" id="geri">Geri</button>' : ""}
        <button id="ileri">\${son ? "Cevapları gönder" : "Sonraki soru"}</button>
        <span class="bosluk"></span>
        \${mod === "hook"
          ? '<button class="metin" id="atla">Quiz\\'i atla, commit\\'le</button><button class="ikincil" id="iptal">Commit\\'i iptal et</button>'
          : '<button class="ikincil" id="kapat">Vazgeç</button>'}
      </div>\`;
    const ileriButonu = $("ileri");
    let kaydet, ileri;
    if (coktan) {
      const sec = (id) => {
        quiz.cevaplar[s.id] = id;
        kok.querySelectorAll(".secenek").forEach((l) => {
          const evet = l.dataset.id === id;
          l.classList.toggle("secili", evet);
          l.querySelector("input").checked = evet;
        });
        ileriButonu.disabled = false;
      };
      kaydet = () => {};
      ileri = () => {
        if (!quiz.cevaplar[s.id]) return; // tek doğru şık var; seçmeden geçilmez
        if (son) gonder({ tip: "gonder", cevaplar: quiz.cevaplar });
        else { quiz.i++; adimCiz(); }
      };
      kok.querySelectorAll(".secenek").forEach((l) => (l.onclick = (e) => { e.preventDefault(); sec(l.dataset.id); }));
      ileriButonu.disabled = !quiz.cevaplar[s.id];
      klavye = (e) => {
        const harf = e.key.toUpperCase();
        const sira = "12345".indexOf(e.key);
        const hedef = s.options.find((o) => o.id.toUpperCase() === harf) || s.options[sira];
        if (hedef && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); sec(hedef.id); }
        else if (e.key === "Enter") { e.preventDefault(); ileri(); }
      };
      ileriButonu.focus();
    } else {
      const t = $("cevap");
      t.focus(); t.setSelectionRange(t.value.length, t.value.length);
      kaydet = () => (quiz.cevaplar[s.id] = t.value);
      ileri = () => {
        kaydet();
        if (son) gonder({ tip: "gonder", cevaplar: quiz.cevaplar });
        else { quiz.i++; adimCiz(); }
      };
      t.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ileri(); } });
      klavye = null;
    }
    tikla("ileri", ileri);
    tikla("geri", () => { kaydet(); quiz.i--; adimCiz(); });
    tikla("atla", () => gonder({ tip: "devam" }));
    tikla("iptal", () => gonder({ tip: "iptal" }));
    tikla("kapat", () => gonder({ tip: "kapat" }));
  }

  /** Çoktan seçmeli sonuç: her şık, doğru olan neden doğru, yanlışlar aslında ne yapar. */
  function sikSonucu(q, r, secilen) {
    const dogruId = r.correct_option;
    const aciklamalar = r.option_explanations || {};
    return \`<div class="secenekler sonuc">\${q.options.map((o) => {
      const dogru = o.id === dogruId;
      const benim = o.id === secilen;
      const sinif = dogru ? "dogru" : benim ? "yanlis" : "";
      const etiket = dogru && benim ? "Doğru cevap · senin cevabın"
        : dogru ? "Doğru cevap" : benim ? "Senin cevabın" : "";
      const aciklama = dogru ? r.explanation : aciklamalar[o.id];
      return \`<div class="secenek \${sinif}">
          <span class="harf">\${dogru ? "✓" : benim ? "✗" : kac(o.id)}</span>
          <div class="metin">\${metin(o.text)}
            \${etiket ? \`<span class="etiket">\${etiket}</span>\` : ""}
            \${aciklama ? \`<div class="aciklama">\${dogru ? "" : "<b>Aslında:</b> "}\${metin(aciklama)}</div>\` : ""}
          </div></div>\`;
    }).join("")}</div>\`;
  }

  // ---------------------------------------------------------------- sonuç sonrası butonlar
  function bitisButonlari(mod, commitMesaji) {
    if (mod === "hook") {
      return \`<div class="butonlar"><button id="devam">Commit'i tamamla</button>
        <button class="ikincil" id="iptal">Commit'i iptal et</button></div>\`;
    }
    return \`<label for="mesaj">Commit mesajı</label>
      <input type="text" id="mesaj" value="\${kac(commitMesaji)}" placeholder="ör. sepet: indirim kodu eklendi">
      <div class="butonlar"><button id="commit">Commit'le</button>
        <button class="ikincil" id="kapat">Vazgeç</button></div>\`;
  }
  function bitisBagla(mod) {
    if (mod === "hook") {
      tikla("devam", () => gonder({ tip: "devam" }));
      tikla("iptal", () => gonder({ tip: "iptal" }));
      $("devam").focus();
      return;
    }
    const girdi = $("mesaj"), buton = $("commit");
    const guncelle = () => (buton.disabled = !girdi.value.trim());
    girdi.addEventListener("input", guncelle); guncelle();
    girdi.addEventListener("keydown", (e) => { if (e.key === "Enter" && !buton.disabled) buton.click(); });
    buton.onclick = () => { buton.disabled = true; gonder({ tip: "commit", mesaj: girdi.value.trim() }); };
    tikla("kapat", () => gonder({ tip: "kapat" }));
  }

  // ---------------------------------------------------------------- ekranlar
  const ciz = {
    yukleniyor(g) {
      kok.innerHTML = baslik() + \`<div class="yukleniyor"><div class="donen"></div>\${kac(g.metin)}</div>\`;
    },

    sorular(g) {
      sonBaslik = g.baslik;
      quiz = { mod: g.mod, sorular: g.sorular, i: 0, cevaplar: {} };
      adimCiz();
    },

    sorusuz(g) {
      sonBaslik = g.baslik;
      kok.innerHTML = baslik() +
        \`<section class="kart"><p class="soru">Bu değişiklik sadece biçim/yorum gibi önemsiz şeyler içeriyor, soracak bir şey yok.</p></section>\` +
        bitisButonlari(g.mod, g.commitMesaji);
      bitisBagla(g.mod);
    },

    degerlendiriliyor() { ciz.yukleniyor({ metin: "Cevapların değerlendiriliyor…" }); },

    sonuc(g) {
      const s = g.sonuc;
      const n = s.results.length;
      const dogru = s.results.filter((r) => r.correct).length;
      const ozetMetni = dogru === n
        ? "Harika, bu değişikliği anlamışsın."
        : dogru === 0
          ? "Bu değişikliği birlikte netleştirelim. Aşağıdaki açıklamalara göz at."
          : "Birkaç noktayı birlikte netleştirelim. Aşağıdaki açıklamalara göz at.";
      const soruBul = (id) => g.sorular.find((q) => q.id === id) || { question: "" };
      kok.innerHTML = baslik() +
        \`<section class="kart"><div class="ozet">
            <div class="sayi">\${dogru} / \${n} <small>doğru</small></div><div>\${kac(ozetMetni)}</div></div>
          <div class="adimlar sonuc-adim">\${s.results.map((r) => \`<span class="\${r.correct ? "d" : "y"}"></span>\`).join("")}</div>
          <div class="not">\${dogru} doğru · \${n - dogru} yanlış</div></section>\` +
        s.results.map((r, i) => {
          const q = soruBul(r.question_id);
          return \`<section class="kart \${r.correct ? "dogru" : "yanlis"}">
            <div class="ust"><span class="no">Soru \${i + 1}</span>
              <span class="durum \${r.correct ? "dogru" : "yanlis"}">\${r.correct ? "✓ Doğru" : "✗ Yanlış"}</span></div>
            <p class="soru">\${metin(q.question)}</p>
            \${q.options && q.options.length ? sikSonucu(q, r, g.cevaplar[r.question_id]) : \`
              <p class="cevabin">Cevabın: \${kac(g.cevaplar[r.question_id] || "(boş)")}</p>
              <p class="geri">\${metin(r.feedback)}</p>
              \${r.explanation ? \`<div class="ders"><b class="baslik">Ders</b>\${metin(r.explanation)}</div>\` : ""}\`}
          </section>\`;
        }).join("") +
        bitisButonlari(g.mod, g.commitMesaji);
      bitisBagla(g.mod);
      window.scrollTo(0, 0);
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

  window.addEventListener("message", (e) => { const g = e.data; klavye = null; if (ciz[g.tip]) ciz[g.tip](g); });
</script>
</body>
</html>`;
}
