import * as path from "path";
import * as vscode from "vscode";
import { Backend, BackendHatasi, httpBackend, mockBackend, QuestionParams, Soru } from "./backend";
import {
  baglamKur, gitApi, GitHatasi, hookDurumu, hookKaldir, hookKur, repoBul, repoSec, Repository, stagedDiff,
} from "./git";
import { Baslik, Mod, Olay, QuizPanel } from "./quizPanel";
import { HookSonucu, HookSunucusu } from "./sunucu";

let sunucu: HookSunucusu | undefined;
let aktif: Oturum | undefined;

export async function activate(context: vscode.ExtensionContext) {
  const komut = (id: string, f: (arg?: { rootUri?: vscode.Uri }) => Promise<unknown>) =>
    vscode.commands.registerCommand(id, (arg) =>
      f(arg).catch((e) => vscode.window.showErrorMessage(`Anladın mı?: ${hataMetni(e)}`))
    );
  context.subscriptions.push(
    komut("anladinmi.commitWithQuiz", butonla),
    komut("anladinmi.installHook", async (arg) => {
      const repo = await repoSec(arg);
      if (repo) await hookuKur(repo.rootUri.fsPath);
    }),
    komut("anladinmi.removeHook", async (arg) => {
      const repo = await repoSec(arg);
      if (!repo) return;
      const silindi = await hookKaldir(repo.rootUri.fsPath);
      vscode.window.showInformationMessage(silindi ? "Hook kaldırıldı." : "Bu repoda Anladın mı? hook'u yok.");
    })
  );

  // Hook köprüsü: mavi Commit butonu -> pre-commit hook -> bu sunucu -> quiz.
  sunucu = new HookSunucusu(hookIleQuiz);
  try {
    await sunucu.baslat();
  } catch (e) {
    vscode.window.showWarningMessage(`Anladın mı?: hook sunucusu başlatılamadı (${hataMetni(e)}).`);
    sunucu = undefined;
  }
  context.subscriptions.push({ dispose: () => sunucu?.kapat() });

  const api = gitApi();
  const hazirla = (r: Repository) => void repoHazirla(context, r.rootUri.fsPath);
  api.repositories.forEach(hazirla);
  context.subscriptions.push(api.onDidOpenRepository(hazirla));
}

export function deactivate() {
  sunucu?.kapat();
}

function hataMetni(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function repoHazirla(context: vscode.ExtensionContext, kok: string) {
  try {
    await sunucu?.repoKaydet(kok);
    const durum = await hookDurumu(kok);
    const anahtar = "hookTeklifi:" + kok.toLowerCase();
    if (durum === "bizim" || durum === "baska" || context.globalState.get(anahtar)) return;
    const secim = await vscode.window.showInformationMessage(
      `Anladın mı?: "${path.basename(kok)}" reposunda mavi Commit butonuna basınca da quiz açılsın mı?`,
      "Evet, bağla",
      "Hayır"
    );
    if (secim === "Evet, bağla") await hookuKur(kok);
    else if (secim === "Hayır") await context.globalState.update(anahtar, true);
  } catch (e) {
    console.error("anladinmi repoHazirla", e);
  }
}

async function hookuKur(kok: string) {
  await hookKur(kok);
  await sunucu?.repoKaydet(kok);
  vscode.window.showInformationMessage(
    `Anladın mı? "${path.basename(kok)}" reposuna bağlandı: Commit butonu artık önce quiz'i açacak.`
  );
}

// ---------------------------------------------------------------- iki giriş noktası

/** Kep butonu, Komut Paleti ya da commit kutusunda Ctrl+Enter. Commit'i eklenti atar. */
async function butonla(arg?: { rootUri?: vscode.Uri }) {
  const repo = await repoSec(arg);
  if (!repo) return;
  const kok = repo.rootUri.fsPath;
  let diff: string;
  try {
    diff = await stagedDiff(kok);
  } catch (e) {
    if (e instanceof GitHatasi) return void vscode.window.showWarningMessage(e.message);
    throw e;
  }
  oturumBaslat({ kok, diff, mod: "buton", repo });
}

/** Mavi Commit butonu ya da terminalde git commit -> hook -> burası. Commit'i git zaten atıyor. */
async function hookIleQuiz(kok: string): Promise<HookSonucu> {
  let diff: string;
  try {
    diff = await stagedDiff(kok);
  } catch {
    return "tamam"; // sorulacak bir şey yok (ör. --allow-empty)
  }
  return new Promise((bitir) => oturumBaslat({ kok, diff, mod: "hook", repo: repoBul(kok), bitir }));
}

interface OturumAyari {
  kok: string;
  diff: string;
  mod: Mod;
  repo?: Repository;
  bitir?: (s: HookSonucu) => void;
}

function oturumBaslat(o: OturumAyari) {
  aktif?.birak();
  const panel = QuizPanel.goster();
  aktif = new Oturum(o, panel);
  void aktif.baslat(vscode.workspace.getConfiguration("anladinmi").get<boolean>("mockMode", false));
}

// ---------------------------------------------------------------- bir quiz turu

class Oturum {
  private backend!: Backend;
  private baslik!: Baslik;
  private sorular: Soru[] = [];
  private sessionId = "";
  private bitti = false;
  private commitMesaji = "";

  constructor(private readonly o: OturumAyari, private readonly panel: QuizPanel) {
    panel.baglan(
      (olay) => this.olay(olay),
      () => this.hookuBitir("tamam") // sekmeyi kapatmak = quiz'i atlamak; commit engellenmez
    );
  }

  /** Yerine yeni bir oturum geliyor. Bekleyen hook varsa commit'i bekletme. */
  birak() {
    this.hookuBitir("tamam");
  }

  private hookuBitir(s: HookSonucu) {
    if (this.bitti || this.o.mod !== "hook") return;
    this.bitti = true;
    this.o.bitir?.(s);
  }

  private olay(o: Olay) {
    switch (o.tip) {
      case "gonder": return void this.degerlendir(o.cevaplar);
      case "commit": return void this.commitle(o.mesaj);
      case "tekrar": return void this.baslat(vscode.workspace.getConfiguration("anladinmi").get<boolean>("mockMode", false));
      case "mockIleDene": return void this.baslat(true);
      case "devam":
      case "iptal": {
        const devam = o.tip === "devam";
        this.hookuBitir(devam ? "tamam" : "iptal");
        this.panel.ciz({ tip: "hookBitti", devam });
        if (devam) setTimeout(() => this.panel.kapat(), 1200);
        return;
      }
    }
  }

  async baslat(mock: boolean) {
    const ayar = vscode.workspace.getConfiguration("anladinmi");
    this.backend = mock ? mockBackend() : httpBackend(ayar.get<string>("backendUrl", "http://127.0.0.1:8765"));
    this.commitMesaji = this.o.repo?.inputBox.value.trim() ?? "";
    this.panel.ciz({ tip: "yukleniyor", metin: mock ? "Örnek sorular hazırlanıyor…" : "Claude soruları hazırlıyor…" });

    try {
      const context = await baglamKur(this.o.kok, this.o.diff, this.commitMesaji);
      this.baslik = {
        repo: context.repo_name ?? "",
        branch: context.branch ?? "(yeni repo)",
        dosyaSayisi: context.added_files.length + context.modified_files.length + context.deleted_files.length,
        mock,
      };
      const params: QuestionParams = {
        num_questions: Math.min(5, Math.max(1, ayar.get<number>("numQuestions", 3))),
        difficulty: ayar.get<"kolay" | "orta" | "zor">("difficulty", "orta"),
        language: "tr",
        focus_topics: [],
      };
      await this.backend.saglik();
      const y = await this.backend.sorular(this.o.diff, context, params);
      this.sorular = y.questions;
      this.sessionId = y.session_id;
    } catch (e) {
      return this.hata(e);
    }

    if (this.sorular.length > 0) {
      this.panel.ciz({ tip: "sorular", mod: this.o.mod, sorular: this.sorular, baslik: this.baslik });
    } else if (this.o.mod === "hook") {
      this.hookuBitir("tamam");
      this.panel.kapat();
      vscode.window.showInformationMessage("Anladın mı?: önemsiz değişiklik, soru yok. Commit devam ediyor.");
    } else {
      this.panel.ciz({ tip: "sorusuz", mod: "buton", baslik: this.baslik, commitMesaji: this.commitMesaji });
    }
  }

  private async degerlendir(cevaplar: Record<string, string>) {
    this.panel.ciz({ tip: "degerlendiriliyor" });
    try {
      const sonuc = await this.backend.degerlendir(
        this.sessionId,
        this.sorular.map((s) => ({ question_id: s.id, answer: (cevaplar[s.id] ?? "").trim() }))
      );
      this.panel.ciz({ tip: "sonuc", mod: this.o.mod, sorular: this.sorular, cevaplar, sonuc, commitMesaji: this.commitMesaji });
    } catch (e) {
      this.hata(e);
    }
  }

  private async commitle(mesaj: string) {
    if (!mesaj || !this.o.repo) return;
    sunucu?.birSonrakiniAtla(this.o.kok); // hook bağlıysa ikinci kez quiz açmasın
    try {
      await this.o.repo.commit(mesaj);
    } catch (e) {
      return this.panel.ciz({ tip: "hata", mod: "buton", metin: `Commit atılamadı: ${hataMetni(e)}`, mockTeklifi: false });
    }
    this.o.repo.inputBox.value = "";
    this.panel.ciz({ tip: "commitlendi", mesaj });
  }

  private hata(e: unknown) {
    const ulasilamadi = e instanceof BackendHatasi && e.ulasilamadi;
    this.panel.ciz({ tip: "hata", mod: this.o.mod, metin: hataMetni(e), mockTeklifi: ulasilamadi });
  }
}
