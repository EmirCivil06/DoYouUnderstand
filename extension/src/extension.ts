import * as vscode from "vscode";
import { Backend, BackendHatasi, httpBackend, mockBackend, QuestionParams, Soru } from "./backend";
import { baglamKur, GitHatasi, repoSec, Repository, stagedDiff } from "./git";
import { Baslik, QuizPanel } from "./quizPanel";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("anladinmi.commitWithQuiz", (arg?: { rootUri?: vscode.Uri }) =>
      calistir(arg).catch((e) => vscode.window.showErrorMessage(`Anladın mı?: ${hataMetni(e)}`))
    )
  );
}

export function deactivate() {}

function hataMetni(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function calistir(arg?: { rootUri?: vscode.Uri }) {
  const repo = await repoSec(arg);
  if (!repo) return;

  let diff: string;
  try {
    diff = await stagedDiff(repo);
  } catch (e) {
    if (e instanceof GitHatasi) {
      vscode.window.showWarningMessage(e.message);
      return;
    }
    throw e;
  }

  const panel = QuizPanel.goster();
  new Oturum(repo, diff, panel).baslat(ayarlardanMock());
}

function ayarlardanMock(): boolean {
  return vscode.workspace.getConfiguration("anladinmi").get<boolean>("mockMode", false);
}

/** Tek bir quiz turu: soru al -> cevapla -> değerlendir -> (her durumda) commit'e izin ver. */
class Oturum {
  private backend!: Backend;
  private baslik!: Baslik;
  private sorular: Soru[] = [];
  private sessionId = "";

  constructor(private readonly repo: Repository, private readonly diff: string, private readonly panel: QuizPanel) {
    panel.dinle((o) => {
      switch (o.tip) {
        case "gonder": return void this.degerlendir(o.cevaplar, o.commitMesaji);
        case "commit": return void this.commitle(o.mesaj);
        case "tekrar": return void this.baslat(ayarlardanMock());
        case "mockIleDene": return void this.baslat(true);
      }
    });
  }

  async baslat(mock: boolean) {
    const ayar = vscode.workspace.getConfiguration("anladinmi");
    this.backend = mock ? mockBackend() : httpBackend(ayar.get<string>("backendUrl", "http://127.0.0.1:8765"));
    const commitMesaji = this.repo.inputBox.value.trim();
    const context = baglamKur(this.repo, this.diff, commitMesaji);
    this.baslik = {
      repo: context.repo_name ?? "",
      branch: context.branch ?? "(detached)",
      dosyaSayisi: context.added_files.length + context.modified_files.length + context.deleted_files.length,
      mock,
    };
    const params: QuestionParams = {
      num_questions: Math.min(5, Math.max(1, ayar.get<number>("numQuestions", 3))),
      difficulty: ayar.get<"kolay" | "orta" | "zor">("difficulty", "orta"),
      language: "tr",
      focus_topics: [],
    };

    this.panel.ciz({ tip: "yukleniyor", metin: mock ? "Örnek sorular hazırlanıyor…" : "Claude soruları hazırlıyor…" });
    try {
      await this.backend.saglik();
      const y = await this.backend.sorular(this.diff, context, params);
      this.sorular = y.questions;
      this.sessionId = y.session_id;
    } catch (e) {
      return this.hata(e);
    }

    if (this.sorular.length === 0) {
      this.panel.ciz({ tip: "sorusuz", baslik: this.baslik, commitMesaji });
    } else {
      this.panel.ciz({ tip: "sorular", sorular: this.sorular, baslik: this.baslik, commitMesaji });
    }
  }

  private async degerlendir(cevaplar: Record<string, string>, commitMesaji: string) {
    this.panel.ciz({ tip: "degerlendiriliyor" });
    try {
      const sonuc = await this.backend.degerlendir(
        this.sessionId,
        this.sorular.map((s) => ({ question_id: s.id, answer: (cevaplar[s.id] ?? "").trim() }))
      );
      this.panel.ciz({ tip: "sonuc", sorular: this.sorular, cevaplar, sonuc, commitMesaji });
    } catch (e) {
      this.hata(e);
    }
  }

  private async commitle(mesaj: string) {
    if (!mesaj) return;
    try {
      await this.repo.commit(mesaj);
    } catch (e) {
      // Örn. pre-commit hook başarısız oldu ya da staged değişiklik kalmadı.
      return this.panel.ciz({ tip: "hata", metin: `Commit atılamadı: ${hataMetni(e)}`, mockTeklifi: false });
    }
    this.repo.inputBox.value = "";
    this.panel.ciz({ tip: "commitlendi", mesaj });
  }

  private hata(e: unknown) {
    const ulasilamadi = e instanceof BackendHatasi && e.ulasilamadi;
    this.panel.ciz({ tip: "hata", metin: hataMetni(e), mockTeklifi: ulasilamadi });
  }
}
