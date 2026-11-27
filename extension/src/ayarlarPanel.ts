// Ayarlar sayfası (webview). Değerler VS Code ayarlarında (anladinmi.*) durur; burası onları
// düzenlemenin kolay yolu. Görünüm değişiklikleri hem buradaki önizlemeye hem açık quiz'e canlı yansır.
import * as crypto from "crypto";
import * as vscode from "vscode";
import { gomJson, ORTAK_CSS, renkMi, TEMA_JS } from "./tema";

/** Düzenlenebilen ayarlar ve her birinin doğrulaması (webview'den gelen değere güvenmeyiz). */
const ALANLAR: Record<string, (v: unknown) => boolean> = {
  "ui.correctColor": renkMi,
  "ui.wrongColor": renkMi,
  "ui.optionSize": (v) => v === "kompakt" || v === "normal" || v === "genis",
  "ui.fontSize": (v) => v === "kucuk" || v === "normal" || v === "buyuk",
  "ui.showWrongExplanations": (v) => typeof v === "boolean",
  difficulty: (v) => v === "kolay" || v === "orta" || v === "zor",
  numQuestions: (v) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5,
  backendUrl: (v) => typeof v === "string" && /^https?:\/\/\S+$/.test(v),
  autoConnectHook: (v) => typeof v === "boolean",
  mockMode: (v) => typeof v === "boolean",
};

/** Hazır renk paletleri: doğru + yanlış rengi birlikte. */
const PALETLER = [
  { ad: "Klasik", dogru: "#22c55e", yanlis: "#ef4444" },
  { ad: "Renk körü dostu", dogru: "#3b82f6", yanlis: "#f97316" },
  { ad: "Pastel", dogru: "#86efac", yanlis: "#fca5a5" },
  { ad: "Neon", dogru: "#39ff14", yanlis: "#ff2d75" },
  { ad: "Okyanus", dogru: "#14b8a6", yanlis: "#d946ef" },
];

type AyarOlayi =
  | { tip: "hazir" }
  | { tip: "degistir"; anahtar: string; deger: unknown }
  | { tip: "sifirla" };

export class AyarlarPanel {
  private static aktif: AyarlarPanel | undefined;

  static goster() {
    if (AyarlarPanel.aktif) return AyarlarPanel.aktif.panel.reveal();
    const panel = vscode.window.createWebviewPanel("anladinmi.ayarlar", "Anladın mı? · Ayarlar", vscode.ViewColumn.Active, {
      enableScripts: true,
    });
    AyarlarPanel.aktif = new AyarlarPanel(panel);
  }

  private constructor(private readonly panel: vscode.WebviewPanel) {
    panel.webview.html = ayarlarHtml(crypto.randomBytes(16).toString("base64"), degerler());
    const abonelikler = [
      panel.webview.onDidReceiveMessage((o: AyarOlayi) => void this.olay(o)),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("anladinmi")) void panel.webview.postMessage({ tip: "degerler", d: degerler() });
      }),
    ];
    panel.onDidDispose(() => {
      AyarlarPanel.aktif = undefined;
      abonelikler.forEach((a) => a.dispose());
    });
  }

  private async olay(o: AyarOlayi) {
    const ayar = vscode.workspace.getConfiguration("anladinmi");
    try {
      if (o.tip === "degistir") {
        const dogrula = ALANLAR[o.anahtar];
        if (!dogrula || !dogrula(o.deger)) return;
        await ayar.update(o.anahtar, o.deger, vscode.ConfigurationTarget.Global);
      } else if (o.tip === "sifirla") {
        for (const k of Object.keys(ALANLAR)) await ayar.update(k, undefined, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage("Anladın mı?: ayarlar varsayılana döndü.");
      }
    } catch (e) {
      vscode.window.showErrorMessage(`Anladın mı?: ayar kaydedilemedi (${e instanceof Error ? e.message : e}).`);
    }
  }
}

function degerler(): Record<string, unknown> {
  const ayar = vscode.workspace.getConfiguration("anladinmi");
  return Object.fromEntries(Object.keys(ALANLAR).map((k) => [k, ayar.get(k)]));
}

export function ayarlarHtml(nonce: string, ilk: Record<string, unknown>): string {
  const segment = (anahtar: string, secenekler: [string | number, string][]) =>
    `<div class="segment" data-anahtar="${anahtar}">${secenekler
      .map(([d, ad]) => `<button type="button" data-deger="${d}">${ad}</button>`).join("")}</div>`;
  const anahtar = (anahtar: string, baslik: string, aciklama: string) =>
    `<label class="satir anahtar"><span><b>${baslik}</b><small>${aciklama}</small></span>
      <input type="checkbox" data-anahtar="${anahtar}"><span class="kaydirac"></span></label>`;

  return /* html */ `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style nonce="${nonce}">
  ${ORTAK_CSS}
  header { margin-bottom: 18px; }
  .soluk { color: var(--soluk); }
  h2 { font-size: .8em; text-transform: uppercase; letter-spacing: .08em; color: var(--soluk); margin: 0 0 4px; }
  .satir { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 10px 0;
           border-top: 1px solid var(--kenar); }
  .kart > .satir:first-of-type { border-top: none; }
  .satir > span:first-child { display: flex; flex-direction: column; }
  .satir small { color: var(--soluk); font-size: .85em; }
  .ikili { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .ikili .kart { margin: 0; }

  /* segment kontrolü */
  .segment { display: inline-flex; border: 1px solid var(--kenar); border-radius: 6px; overflow: hidden; flex: none; }
  .segment button { background: transparent; color: var(--vscode-foreground); border-radius: 0; padding: 4px 12px; }
  .segment button + button { border-left: 1px solid var(--kenar); }
  .segment button:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,.15)); }
  .segment button.secili { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }

  /* renk */
  .renk { display: flex; align-items: center; gap: 8px; flex: none; }
  .renk input[type=color] { width: 34px; height: 26px; padding: 0; border: 1px solid var(--kenar); border-radius: 4px;
                            background: none; cursor: pointer; }
  .renk code { min-width: 66px; text-align: center; }
  .satir.dikey { flex-direction: column; align-items: stretch; gap: 8px; }
  .paletler { display: flex; flex-wrap: wrap; gap: 6px; }
  .palet { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px 4px 6px; border-radius: 14px;
           background: transparent; color: var(--vscode-foreground); border: 1px solid var(--kenar); font-size: .9em; }
  .palet:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,.15)); }
  .palet.secili { border-color: var(--vscode-focusBorder); background: color-mix(in srgb, var(--vurgu) 15%, transparent); }
  .noktalar { display: inline-flex; }
  .noktalar i { width: 14px; height: 14px; border-radius: 50%; border: 1px solid rgba(0,0,0,.25); }
  .noktalar i + i { margin-left: -4px; }
  .hazir { display: flex; gap: 6px; }
  .hazir button { width: 18px; height: 18px; padding: 0; border-radius: 50%; border: 1px solid var(--kenar); }

  /* anahtar (toggle) */
  label.anahtar { cursor: pointer; position: relative; }
  label.anahtar input { position: absolute; opacity: 0; pointer-events: none; }
  .kaydirac { flex: none; width: 34px; height: 18px; border-radius: 9px; background: var(--kenar); position: relative; transition: background .15s; }
  .kaydirac::after { content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%;
                     background: #fff; transition: transform .15s; }
  input:checked + .kaydirac { background: var(--vscode-button-background); }
  input:checked + .kaydirac::after { transform: translateX(16px); }
  input:focus-visible + .kaydirac { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }

  .url { flex: 1; max-width: 280px; }
  .url.gecersiz { outline: 1px solid var(--kotu); }
  .onizleme .soru { margin: 0 0 10px; font-weight: 600; }
  .ozet-ornek { display: flex; gap: 8px; margin-top: 10px; }
  .ozet-ornek span { flex: 1; text-align: center; padding: 6px; border-radius: 6px; font-size: .85em; font-weight: 600; }
  .ozet-ornek .iyi { border: 2px solid var(--iyi); color: var(--iyi); }
  .ozet-ornek .kotu { border: 2px solid var(--kotu); color: var(--kotu); }
  .alt-butonlar { display: flex; justify-content: flex-end; margin-top: 6px; }
  @media (max-width: 640px) { .ikili { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<main>
  <header><h1>Ayarlar</h1><div class="soluk">Değişiklikler hemen kaydedilir ve açık quiz ekranına uygulanır.</div></header>

  <div class="ikili">
    <section class="kart">
      <h2>Görünüm</h2>
      <div class="satir dikey"><span><b>Renk paleti</b><small>Doğru ve yanlış rengini birlikte seçer</small></span>
        <div class="paletler">${PALETLER.map((p) => `<button type="button" class="palet" data-dogru="${p.dogru}" data-yanlis="${p.yanlis}">
          <span class="noktalar"><i data-renk="${p.dogru}"></i><i data-renk="${p.yanlis}"></i></span>${p.ad}</button>`).join("")}</div></div>
      <div class="satir"><span><b>Doğru rengi</b></span>
        <span class="renk"><span class="hazir" data-hedef="ui.correctColor">
          <button type="button" data-renk="#22c55e" title="Yeşil"></button><button type="button" data-renk="#14b8a6" title="Turkuaz"></button><button type="button" data-renk="#3b82f6" title="Mavi"></button></span>
          <input type="color" data-anahtar="ui.correctColor"><code data-goster="ui.correctColor"></code></span></div>
      <div class="satir"><span><b>Yanlış rengi</b></span>
        <span class="renk"><span class="hazir" data-hedef="ui.wrongColor">
          <button type="button" data-renk="#ef4444" title="Kırmızı"></button><button type="button" data-renk="#f97316" title="Turuncu"></button><button type="button" data-renk="#d946ef" title="Mor"></button></span>
          <input type="color" data-anahtar="ui.wrongColor"><code data-goster="ui.wrongColor"></code></span></div>
      <div class="satir"><span><b>Şık boyutu</b></span>
        ${segment("ui.optionSize", [["kompakt", "Kompakt"], ["normal", "Normal"], ["genis", "Geniş"]])}</div>
      <div class="satir"><span><b>Yazı boyutu</b></span>
        ${segment("ui.fontSize", [["kucuk", "Küçük"], ["normal", "Normal"], ["buyuk", "Büyük"]])}</div>
      ${anahtar("ui.showWrongExplanations", "Yanlış şıkların açıklamaları", "Kapalıysa sadece doğru cevabın açıklaması görünür")}
    </section>

    <section class="kart onizleme cevaplandi">
      <h2>Önizleme</h2>
      <p class="soru"><code>ortalama_fiyat({})</code> çağrılırsa ne olur?</p>
      <div class="secenekler">
        <div class="secenek yanlis"><span class="harf">✗</span><div class="metin"><code>0</code> döndürür<span class="etiket">Senin cevabın</span>
          <div class="aciklama"><b>Aslında:</b> boş sepet kontrolü yok, kod doğrudan böler.</div></div></div>
        <div class="secenek dogru"><span class="harf">✓</span><div class="metin"><code>ZeroDivisionError</code> verir<span class="etiket">Doğru cevap</span>
          <div class="aciklama">Toplam 0 olur ve 0'a bölmek hata verir.</div></div></div>
        <div class="secenek"><span class="harf">C</span><div class="metin"><code>None</code> döndürür
          <div class="aciklama"><b>Aslında:</b> fonksiyonda <code>return None</code> yolu yok.</div></div></div>
      </div>
      <div class="ozet-ornek"><span class="iyi">Özet: 2–3 doğru</span><span class="kotu">Özet: 0–1 doğru</span></div>
    </section>
  </div>

  <section class="kart">
    <h2>Quiz</h2>
    <div class="satir"><span><b>Zorluk</b></span>
      ${segment("difficulty", [["kolay", "Kolay"], ["orta", "Orta"], ["zor", "Zor"]])}</div>
    <div class="satir"><span><b>Soru sayısı</b><small>Her commit'te sorulacak soru</small></span>
      ${segment("numQuestions", [1, 2, 3, 4, 5].map((n) => [n, String(n)] as [number, string]))}</div>
  </section>

  <section class="kart">
    <h2>Bağlantı</h2>
    <div class="satir"><span><b>Backend adresi</b><small>FastAPI sunucusu</small></span>
      <input type="text" class="url" data-anahtar="backendUrl" spellcheck="false"></div>
    ${anahtar("autoConnectHook", "Commit butonuna otomatik bağlan", "Repo açılınca pre-commit hook kurar; başkasının hook'una dokunmaz")}
    ${anahtar("mockMode", "Örnek sorular (backend'siz)", "Claude'a gitmeden hazır sorularla dene")}
  </section>

  <div class="alt-butonlar"><button class="ikincil" id="sifirla">Varsayılanlara dön</button></div>
</main>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const gonder = (o) => vscode.postMessage(o);
  ${TEMA_JS}
  let d = ${gomJson(ilk)};
  const kaydet = (anahtar, deger) => { d[anahtar] = deger; onizle(); gonder({ tip: "degistir", anahtar, deger }); };
  const temaNesnesi = () => ({
    dogruRengi: d["ui.correctColor"], yanlisRengi: d["ui.wrongColor"], sikBoyutu: d["ui.optionSize"],
    yaziBoyutu: d["ui.fontSize"], yanlisAciklamalari: d["ui.showWrongExplanations"] !== false,
  });
  const onizle = () => temaUygula(temaNesnesi());

  // renk seçici + hazır renkler
  document.querySelectorAll("input[type=color]").forEach((g) => {
    g.addEventListener("input", () => { d[g.dataset.anahtar] = g.value; goster(); onizle(); }); // sürüklerken canlı
    g.addEventListener("change", () => kaydet(g.dataset.anahtar, g.value)); //                    bırakınca kaydet
  });
  document.querySelectorAll(".hazir button").forEach((b) => {
    b.style.background = b.dataset.renk; // CSSOM: CSP'ye takılmaz
    b.onclick = () => { kaydet(b.parentElement.dataset.hedef, b.dataset.renk); doldur(); };
  });
  // hazır paletler: iki rengi birlikte değiştirir
  document.querySelectorAll(".noktalar i").forEach((i) => (i.style.background = i.dataset.renk));
  document.querySelectorAll(".palet").forEach((p) => {
    p.onclick = () => { kaydet("ui.correctColor", p.dataset.dogru); kaydet("ui.wrongColor", p.dataset.yanlis); doldur(); };
  });
  // segmentler
  document.querySelectorAll(".segment").forEach((s) => s.querySelectorAll("button").forEach((b) => {
    b.onclick = () => {
      const sayi = s.dataset.anahtar === "numQuestions";
      kaydet(s.dataset.anahtar, sayi ? Number(b.dataset.deger) : b.dataset.deger);
      doldur();
    };
  }));
  // anahtarlar
  document.querySelectorAll("input[type=checkbox]").forEach((c) => (c.onchange = () => kaydet(c.dataset.anahtar, c.checked)));
  // backend adresi: geçerliyse kaydet
  const url = document.querySelector(".url");
  url.addEventListener("input", () => url.classList.toggle("gecersiz", !/^https?:\\/\\/\\S+$/.test(url.value.trim())));
  url.addEventListener("change", () => { const v = url.value.trim(); if (/^https?:\\/\\/\\S+$/.test(v)) kaydet("backendUrl", v); });
  document.getElementById("sifirla").onclick = () => gonder({ tip: "sifirla" });

  function goster() {
    document.querySelectorAll("[data-goster]").forEach((c) => (c.textContent = String(d[c.dataset.goster] || "").toUpperCase()));
  }
  function doldur() {
    document.querySelectorAll("input[type=color]").forEach((g) => (g.value = d[g.dataset.anahtar]));
    const kucuk = (s) => String(s || "").toLowerCase();
    document.querySelectorAll(".palet").forEach((p) => p.classList.toggle("secili",
      kucuk(p.dataset.dogru) === kucuk(d["ui.correctColor"]) && kucuk(p.dataset.yanlis) === kucuk(d["ui.wrongColor"])));
    document.querySelectorAll(".segment").forEach((s) => s.querySelectorAll("button").forEach((b) =>
      b.classList.toggle("secili", String(d[s.dataset.anahtar]) === b.dataset.deger)));
    document.querySelectorAll("input[type=checkbox]").forEach((c) => (c.checked = !!d[c.dataset.anahtar]));
    if (document.activeElement !== url) { url.value = d.backendUrl || ""; url.classList.remove("gecersiz"); }
    goster(); onizle();
  }
  window.addEventListener("message", (e) => { if (e.data.tip === "degerler") { d = e.data.d; doldur(); } });
  doldur();
</script>
</body>
</html>`;
}
