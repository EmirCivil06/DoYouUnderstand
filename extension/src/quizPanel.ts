// Quiz ekranı (webview). Durumu eklenti tarafı yönetir; webview sadece çizer ve olay yollar.
import * as crypto from "crypto";
import * as vscode from "vscode";
import type { DegerlendirmeYaniti, Soru } from "./backend";

/** Eklenti -> webview */
export type Gorunum =
  | { tip: "yukleniyor"; metin: string }
  | { tip: "sorular"; sorular: Soru[]; baslik: Baslik; commitMesaji: string }
  | { tip: "sorusuz"; baslik: Baslik; commitMesaji: string }
  | { tip: "degerlendiriliyor" }
  | { tip: "sonuc"; sorular: Soru[]; cevaplar: Record<string, string>; sonuc: DegerlendirmeYaniti; commitMesaji: string }
  | { tip: "commitlendi"; mesaj: string }
  | { tip: "hata"; metin: string; mockTeklifi: boolean };

export interface Baslik {
  repo: string;
  branch: string;
  dosyaSayisi: number;
  mock: boolean;
}

/** Webview -> eklenti */
export type Olay =
  | { tip: "gonder"; cevaplar: Record<string, string>; commitMesaji: string }
  | { tip: "commit"; mesaj: string }
  | { tip: "tekrar" }
  | { tip: "mockIleDene" }
  | { tip: "kapat" };

export class QuizPanel {
  private static aktif: QuizPanel | undefined;
  private dinleyici: ((o: Olay) => void) | undefined;

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
    });
  }

  dinle(f: (o: Olay) => void) {
    this.dinleyici = f;
  }

  ciz(g: Gorunum) {
    void this.panel.webview.postMessage(g);
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
  }
  * { box-sizing: border-box; }
  body {
    font-family: var(--vscode-font-family); font-size: var(--vscode-font-size);
    color: var(--vscode-foreground); background: var(--vscode-editor-background);
    margin: 0; padding: 28px 24px 48px; line-height: 1.55;
  }
  main { max-width: 760px; margin: 0 auto; }
  header { margin-bottom: 22px; }
  h1 { font-size: 1.6em; font-weight: 600; margin: 0 0 4px; letter-spacing: -.01em; }
  .alt { color: var(--soluk); font-size: .95em; display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; }
  .rozet { font-size: .78em; padding: 1px 8px; border-radius: 10px; border: 1px solid var(--kenar); color: var(--soluk); }
  .rozet.mock { border-color: var(--vscode-editorWarning-foreground); color: var(--vscode-editorWarning-foreground); }
  .kart {
    background: var(--kart); border: 1px solid var(--kenar); border-radius: 8px;
    padding: 16px 18px; margin-bottom: 14px;
  }
  .kart.dogru { border-left: 3px solid var(--iyi); }
  .kart.yanlis { border-left: 3px solid var(--kotu); }
  .ust { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-bottom: 6px; }
  .no { font-weight: 600; font-size: .85em; text-transform: uppercase; letter-spacing: .06em; color: var(--soluk); }
  .konu { font-size: .8em; padding: 1px 8px; border-radius: 10px;
          background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
  .dosya { font-family: var(--vscode-editor-font-family); font-size: .85em; color: var(--soluk); margin-bottom: 8px; }
  .soru { font-size: 1.05em; margin: 0 0 12px; }
  code { font-family: var(--vscode-editor-font-family); font-size: .92em; padding: 0 4px; border-radius: 3px;
         background: var(--vscode-textCodeBlock-background); }
  textarea, input[type=text] {
    width: 100%; font: inherit; color: var(--vscode-input-foreground); background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, var(--kenar)); border-radius: 4px; padding: 8px 10px;
  }
  textarea { min-height: 64px; resize: vertical; }
  textarea:focus, input:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
  label { display: block; font-size: .9em; color: var(--soluk); margin: 18px 0 6px; }
  .butonlar { display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap; }
  .butonlar.orta { justify-content: center; }
  button {
    font: inherit; border: none; border-radius: 4px; padding: 7px 16px; cursor: pointer;
    background: var(--vscode-button-background); color: var(--vscode-button-foreground);
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.ikincil { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  button.ikincil:hover { background: var(--vscode-button-secondaryHoverBackground); }
  button:disabled { opacity: .5; cursor: default; }
  .yukleniyor { display: flex; align-items: center; gap: 12px; color: var(--soluk); padding: 40px 0; justify-content: center; }
  .donen { width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--kenar);
           border-top-color: var(--vscode-progressBar-background); animation: don 0.8s linear infinite; }
  @keyframes don { to { transform: rotate(360deg); } }
  .ozet { display: flex; align-items: center; gap: 18px; }
  .yuzde { font-size: 2.4em; font-weight: 600; line-height: 1; font-variant-numeric: tabular-nums; }
  .cubuk { height: 6px; border-radius: 3px; background: var(--kenar); overflow: hidden; margin-top: 12px; }
  .cubuk > div { height: 100%; background: var(--iyi); }
  .cubuk.dusuk > div { background: var(--vscode-editorWarning-foreground); }
  .cevabin { color: var(--soluk); font-size: .92em; margin: 0 0 8px; white-space: pre-wrap; }
  .geri { margin: 0; }
  .ders { margin-top: 12px; padding: 10px 12px; border-radius: 6px;
          background: var(--vscode-textBlockQuote-background); border-left: 3px solid var(--vscode-textLink-foreground); }
  .ders b { display: block; font-size: .8em; text-transform: uppercase; letter-spacing: .06em; color: var(--soluk); margin-bottom: 4px; }
  .durum { font-weight: 600; }
  .durum.dogru { color: var(--iyi); } .durum.yanlis { color: var(--kotu); }
  .hata { border-left: 3px solid var(--kotu); }
  .bitti { text-align: center; padding: 36px 0; }
  .bitti .ikon { font-size: 2.2em; color: var(--iyi); }
  .not { color: var(--soluk); font-size: .9em; }
</style>
</head>
<body>
<main id="kok"><div class="yukleniyor"><div class="donen"></div>Hazırlanıyor…</div></main>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const kok = document.getElementById("kok");
  const gonder = (o) => vscode.postMessage(o);

  // Güvenli metin: önce HTML kaçır, sonra yalnızca \`kod\` parçalarını <code> yap.
  const kac = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const metin = (s) => kac(s)
    .replace(/\`([^\`]+)\`/g, "<code>$1</code>")
    .replace(/\\*\\*([^*]+)\\*\\*/g, "<b>$1</b>");

  function baslik(b, alt) {
    return \`<header><h1>Anladın mı?</h1><div class="alt">
      <span>\${kac(b.repo)}</span><span>⎇ \${kac(b.branch)}</span><span>\${b.dosyaSayisi} dosya</span>
      \${b.mock ? '<span class="rozet mock">örnek sorular · backend yok</span>' : ""}
      \${alt ? '<span>' + alt + '</span>' : ""}</div></header>\`;
  }
  let sonBaslik = null;

  function commitAlani(mesaj, butonMetni) {
    return \`<label for="mesaj">Commit mesajı</label>
      <input type="text" id="mesaj" value="\${kac(mesaj)}" placeholder="ör. sepet: indirim kodu eklendi">\`;
  }

  const ciz = {
    yukleniyor(g) {
      kok.innerHTML = (sonBaslik ? baslik(sonBaslik) : "") +
        \`<div class="yukleniyor"><div class="donen"></div>\${kac(g.metin)}</div>\`;
    },

    sorular(g) {
      sonBaslik = g.baslik;
      const n = g.sorular.length;
      kok.innerHTML = baslik(g.baslik, "Commit'lemeden önce kodunu ne kadar anladığına bakalım.") +
        g.sorular.map((s, i) => \`
          <section class="kart">
            <div class="ust"><span class="no">Soru \${i + 1} / \${n}</span><span class="konu">\${kac(s.topic)}</span></div>
            \${s.file ? \`<div class="dosya">\${kac(s.file)}\${s.line_hint ? ":" + s.line_hint : ""}</div>\` : ""}
            <p class="soru">\${metin(s.question)}</p>
            <textarea data-id="\${kac(s.id)}" placeholder="Kendi cümlelerinle anlat. Emin değilsen tahminini yaz."></textarea>
          </section>\`).join("") +
        commitAlani(g.commitMesaji) +
        \`<div class="butonlar"><button id="gonder">Cevapları gönder</button>
          <button class="ikincil" id="kapat">Vazgeç</button></div>
          <p class="not">Sonuç ne olursa olsun commit atabilirsin. Amaç engellemek değil, öğrenmek.</p>\`;
      const ilk = kok.querySelector("textarea"); if (ilk) ilk.focus();
      document.getElementById("kapat").onclick = () => gonder({ tip: "kapat" });
      document.getElementById("gonder").onclick = () => {
        const cevaplar = {};
        kok.querySelectorAll("textarea").forEach((t) => (cevaplar[t.dataset.id] = t.value));
        gonder({ tip: "gonder", cevaplar, commitMesaji: document.getElementById("mesaj").value });
      };
    },

    sorusuz(g) {
      sonBaslik = g.baslik;
      kok.innerHTML = baslik(g.baslik) +
        \`<section class="kart"><p class="soru">Bu değişiklik sadece biçim/yorum gibi önemsiz şeyler içeriyor, soracak bir şey yok.</p></section>\` +
        commitAlani(g.commitMesaji) + commitButonlari();
      commitBagla();
    },

    degerlendiriliyor() { ciz.yukleniyor({ metin: "Cevapların değerlendiriliyor…" }); },

    sonuc(g) {
      const s = g.sonuc;
      const yuzde = Math.round((s.score ?? 0) * 100);
      const ozetMetni = s.passed
        ? "Harika, bu değişikliği anlamışsın."
        : "Birkaç noktayı birlikte netleştirelim. Aşağıdaki açıklamalara göz at.";
      const soruBul = (id) => g.sorular.find((q) => q.id === id) || { question: "", topic: "" };
      kok.innerHTML = (sonBaslik ? baslik(sonBaslik) : "") +
        \`<section class="kart"><div class="ozet"><div class="yuzde">%\${yuzde}</div><div>\${kac(ozetMetni)}</div></div>
          <div class="cubuk \${s.passed ? "" : "dusuk"}"><div id="dolu"></div></div></section>\` +
        s.results.map((r, i) => {
          const q = soruBul(r.question_id);
          return \`<section class="kart \${r.correct ? "dogru" : "yanlis"}">
            <div class="ust"><span class="no">Soru \${i + 1}</span>
              <span class="durum \${r.correct ? "dogru" : "yanlis"}">\${r.correct ? "✓ Doğru" : "✗ Eksik"} · %\${Math.round((r.score ?? 0) * 100)}</span></div>
            <p class="soru">\${metin(q.question)}</p>
            <p class="cevabin">Cevabın: \${kac(g.cevaplar[r.question_id] || "(boş)")}</p>
            <p class="geri">\${metin(r.feedback)}</p>
            \${r.explanation ? \`<div class="ders"><b>Ders</b>\${metin(r.explanation)}</div>\` : ""}
          </section>\`;
        }).join("") +
        commitAlani(g.commitMesaji) + commitButonlari();
      // CSP satır içi style'a izin vermiyor; genişliği JS ile veriyoruz.
      document.getElementById("dolu").style.width = Math.max(0, Math.min(100, yuzde)) + "%";
      commitBagla();
    },

    commitlendi(g) {
      kok.innerHTML = (sonBaslik ? baslik(sonBaslik) : "") +
        \`<div class="bitti"><div class="ikon">✓</div><p class="soru">Commit atıldı</p>
          <p class="not"><code>\${kac(g.mesaj)}</code></p>
          <div class="butonlar orta"><button class="ikincil" id="kapat">Kapat</button></div></div>\`;
      document.getElementById("kapat").onclick = () => gonder({ tip: "kapat" });
    },

    hata(g) {
      kok.innerHTML = (sonBaslik ? baslik(sonBaslik) : "<header><h1>Anladın mı?</h1></header>") +
        \`<section class="kart hata"><p class="soru">\${metin(g.metin)}</p></section>
          <div class="butonlar"><button id="tekrar">Tekrar dene</button>
          \${g.mockTeklifi ? '<button class="ikincil" id="mock">Örnek sorularla dene</button>' : ""}
          <button class="ikincil" id="kapat">Kapat</button></div>\`;
      document.getElementById("tekrar").onclick = () => gonder({ tip: "tekrar" });
      document.getElementById("kapat").onclick = () => gonder({ tip: "kapat" });
      const m = document.getElementById("mock"); if (m) m.onclick = () => gonder({ tip: "mockIleDene" });
    },
  };

  function commitButonlari() {
    return \`<div class="butonlar"><button id="commit">Commit'le</button>
      <button class="ikincil" id="kapat">Vazgeç</button></div>\`;
  }
  function commitBagla() {
    const girdi = document.getElementById("mesaj");
    const buton = document.getElementById("commit");
    const guncelle = () => (buton.disabled = !girdi.value.trim());
    girdi.addEventListener("input", guncelle); guncelle();
    girdi.addEventListener("keydown", (e) => { if (e.key === "Enter" && !buton.disabled) buton.click(); });
    buton.onclick = () => { buton.disabled = true; gonder({ tip: "commit", mesaj: girdi.value.trim() }); };
    document.getElementById("kapat").onclick = () => gonder({ tip: "kapat" });
  }

  window.addEventListener("message", (e) => { const g = e.data; if (ciz[g.tip]) ciz[g.tip](g); });
</script>
</body>
</html>`;
}
