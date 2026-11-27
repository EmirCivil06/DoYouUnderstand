// Görünüm ayarları (anladinmi.ui.*) + quiz ekranı ile ayarlar sayfasının ortak CSS'i.
import * as vscode from "vscode";

export type SikBoyutu = "kompakt" | "normal" | "genis";
export type YaziBoyutu = "kucuk" | "normal" | "buyuk";

export interface Tema {
  dogruRengi: string;
  yanlisRengi: string;
  sikBoyutu: SikBoyutu;
  yaziBoyutu: YaziBoyutu;
  yanlisAciklamalari: boolean;
}

export const VARSAYILAN_TEMA: Tema = {
  dogruRengi: "#22c55e",
  yanlisRengi: "#ef4444",
  sikBoyutu: "normal",
  yaziBoyutu: "normal",
  yanlisAciklamalari: true,
};

export const renkMi = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);

export function temaOku(): Tema {
  const a = vscode.workspace.getConfiguration("anladinmi");
  const d = VARSAYILAN_TEMA;
  const sec = <T extends string>(v: unknown, izinli: readonly T[], vars: T): T =>
    izinli.includes(v as T) ? (v as T) : vars;
  return {
    dogruRengi: renkMi(a.get("ui.correctColor")) ? a.get<string>("ui.correctColor")! : d.dogruRengi,
    yanlisRengi: renkMi(a.get("ui.wrongColor")) ? a.get<string>("ui.wrongColor")! : d.yanlisRengi,
    sikBoyutu: sec(a.get("ui.optionSize"), ["kompakt", "normal", "genis"] as const, d.sikBoyutu),
    yaziBoyutu: sec(a.get("ui.fontSize"), ["kucuk", "normal", "buyuk"] as const, d.yaziBoyutu),
    yanlisAciklamalari: a.get<boolean>("ui.showWrongExplanations", d.yanlisAciklamalari) !== false,
  };
}

/** Webview'de çalışır: temayı CSS değişkenlerine uygular (CSP inline style'a izin vermez, CSSOM serbest). */
export const TEMA_JS = /* js */ `
  const SIK_PAD = { kompakt: "6px 10px", normal: "9px 12px", genis: "13px 14px" };
  const OLCEK = { kucuk: 0.92, normal: 1, buyuk: 1.12 };
  function temaUygula(t) {
    const r = document.documentElement.style;
    r.setProperty("--iyi", t.dogruRengi);
    r.setProperty("--kotu", t.yanlisRengi);
    r.setProperty("--sik-pad", SIK_PAD[t.sikBoyutu] || SIK_PAD.normal);
    r.setProperty("--olcek", String(OLCEK[t.yaziBoyutu] || 1));
    document.body.classList.toggle("yanlis-gizli", !t.yanlisAciklamalari);
  }`;

/** JSON'u <script> içine güvenle gömmek için. */
export const gomJson = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");

export const ORTAK_CSS = /* css */ `
  :root {
    --iyi: ${VARSAYILAN_TEMA.dogruRengi};
    --kotu: ${VARSAYILAN_TEMA.yanlisRengi};
    --sik-pad: 9px 12px;
    --olcek: 1;
    --kenar: var(--vscode-widget-border, var(--vscode-panel-border, rgba(128,128,128,.35)));
    --soluk: var(--vscode-descriptionForeground);
    --kart: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
    --vurgu: var(--vscode-progressBar-background, #0078d4);
  }
  * { box-sizing: border-box; }
  body {
    font-family: var(--vscode-font-family); font-size: calc(var(--vscode-font-size, 13px) * var(--olcek));
    color: var(--vscode-foreground); background: var(--vscode-editor-background);
    margin: 0; padding: 28px 24px 48px; line-height: 1.5;
  }
  main { max-width: 720px; margin: 0 auto; }
  h1 { font-size: 1.6em; font-weight: 600; margin: 0 0 4px; letter-spacing: -.01em; }
  h2 { font-size: 1.15em; font-weight: 600; margin: 0 0 12px; }
  .kart {
    background: var(--kart); border: 1px solid var(--kenar); border-radius: 8px;
    padding: 18px 20px; margin-bottom: 14px;
  }
  code { font-family: var(--vscode-editor-font-family); font-size: .92em; padding: 0 4px; border-radius: 3px;
         background: var(--vscode-textCodeBlock-background); }
  textarea, input[type=text] {
    width: 100%; font: inherit; color: var(--vscode-input-foreground); background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, var(--kenar)); border-radius: 4px; padding: 8px 10px;
  }
  textarea:focus, input:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
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
  kbd { font-family: var(--vscode-editor-font-family); font-size: .85em; padding: 0 5px; border-radius: 3px;
        border: 1px solid var(--kenar); }

  /* şıklar */
  .secenekler { display: flex; flex-direction: column; gap: 4px; }
  .secenek { display: flex; gap: 10px; align-items: flex-start; padding: var(--sik-pad); border-radius: 6px;
             border: 1px solid var(--kenar); background: var(--vscode-input-background); }
  label.secenek { cursor: pointer; position: relative; }
  label.secenek:hover { border-color: var(--vscode-focusBorder); }
  .secenek input { position: absolute; opacity: 0; pointer-events: none; }
  .secenek .harf { flex: none; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center;
                   font-weight: 600; font-size: .85em; border: 1px solid var(--kenar); color: var(--soluk); }
  .secenek .metin { flex: 1; padding-top: 1px; }
  .secenek.secili { border-color: var(--vurgu); background: color-mix(in srgb, var(--vurgu) 12%, var(--vscode-input-background)); }
  .secenek.secili .harf { background: var(--vurgu); border-color: var(--vurgu); color: var(--vscode-button-foreground); }
  .cevaplandi .secenek { background: transparent; }
  .cevaplandi .secenek.dogru { border-color: var(--iyi); background: color-mix(in srgb, var(--iyi) 10%, transparent); }
  .cevaplandi .secenek.dogru .harf { background: var(--iyi); border-color: var(--iyi); color: #fff; }
  .cevaplandi .secenek.yanlis { border-color: var(--kotu); background: color-mix(in srgb, var(--kotu) 10%, transparent); }
  .cevaplandi .secenek.yanlis .harf { background: var(--kotu); border-color: var(--kotu); color: #fff; }
  .etiket { display: inline-block; margin-left: 8px; font-size: .75em; font-weight: 600; color: var(--soluk);
            text-transform: uppercase; letter-spacing: .04em; }
  .dogru .etiket { color: var(--iyi); } .yanlis .etiket { color: var(--kotu); }
  .aciklama { margin-top: 3px; font-size: .9em; opacity: .85; }
  /* ayar: yanlış şıkların açıklamalarını gizle (doğrunun açıklaması hep görünür) */
  body.yanlis-gizli .secenek:not(.dogru) .aciklama { display: none; }
`;
