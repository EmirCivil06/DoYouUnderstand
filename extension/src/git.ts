// Git tarafı: repo seçimi (VS Code git API), diff ve bağlam (git CLI), hook kurulumu.
// Diff/bağlam için doğrudan git CLI kullanıyoruz: hook akışında commit sürerken VS Code'un
// git kuyruğu meşgul olabilir, CLI ise index'i her zaman okuyabilir.
import { execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import type { DiffContext } from "./backend";

// --- vscode.git API'sinin kullandığımız küçük bir parçası (resmi git.d.ts'ten) ---
export interface Repository {
  readonly rootUri: vscode.Uri;
  readonly inputBox: { value: string };
  commit(message: string): Promise<void>;
}

export interface GitAPI {
  readonly repositories: Repository[];
  onDidOpenRepository: vscode.Event<Repository>;
}

export class GitHatasi extends Error {}

export function gitApi(): GitAPI {
  const ext = vscode.extensions.getExtension<{ getAPI(v: 1): GitAPI }>("vscode.git");
  if (!ext || !ext.isActive) {
    throw new GitHatasi("VS Code'un Git eklentisi etkin değil.");
  }
  return ext.exports.getAPI(1);
}

export function repoBul(kok: string): Repository | undefined {
  const norm = (p: string) => path.resolve(p).toLowerCase();
  return gitApi().repositories.find((r) => norm(r.rootUri.fsPath) === norm(kok));
}

/** Kaynak Denetimi'nden çağrıldıysa o repo, değilse tek repo ya da kullanıcının seçtiği. */
export async function repoSec(arg?: { rootUri?: vscode.Uri }): Promise<Repository | undefined> {
  const repos = gitApi().repositories;
  if (repos.length === 0) {
    throw new GitHatasi("Açık klasörde bir git reposu bulunamadı.");
  }
  if (arg?.rootUri) {
    const r = repos.find((x) => x.rootUri.toString() === arg.rootUri!.toString());
    if (r) return r;
  }
  if (repos.length === 1) return repos[0];
  const secim = await vscode.window.showQuickPick(
    repos.map((r) => ({ label: path.basename(r.rootUri.fsPath), detail: r.rootUri.fsPath, r })),
    { placeHolder: "Hangi repo?" }
  );
  return secim?.r;
}

export function git(kok: string, args: string[]): Promise<string> {
  return new Promise((coz, reddet) => {
    execFile("git", args, { cwd: kok, maxBuffer: 50 * 1024 * 1024, windowsHide: true }, (hata, stdout, stderr) => {
      if (hata) reddet(new GitHatasi((stderr || hata.message).trim()));
      else coz(stdout);
    });
  });
}

// Lock dosyaları soru üretmek için gürültü; diff'ten çıkarılır (CLI ile aynı kural).
// Pathspec'te * "/" işaretini de geçer: hem kökteki hem alt klasördeki dosyaları yakalar.
const HARIC = [":(exclude)*.lock", ":(exclude)*package-lock.json"];

export async function stagedDiff(kok: string): Promise<string> {
  const diff = await git(kok, ["diff", "--cached", "--", ".", ...HARIC]);
  if (!diff.trim()) {
    throw new GitHatasi("Staged değişiklik yok. Önce dosyaları stage et (+ butonu ya da git add).");
  }
  return diff;
}

const DILLER: Record<string, string> = {
  ".py": "python", ".ts": "typescript", ".tsx": "typescript", ".js": "javascript", ".jsx": "javascript",
  ".java": "java", ".kt": "kotlin", ".cs": "csharp", ".go": "go", ".rs": "rust", ".rb": "ruby",
  ".php": "php", ".c": "c", ".h": "c", ".cpp": "cpp", ".hpp": "cpp", ".swift": "swift",
  ".dart": "dart", ".sql": "sql", ".html": "html", ".css": "css", ".sh": "shell", ".ps1": "powershell",
};

export async function baglamKur(kok: string, diff: string, commitMesaji: string): Promise<DiffContext> {
  const added: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];
  const durum = await git(kok, ["diff", "--cached", "--name-status", "--", ".", ...HARIC]);
  for (const satir of durum.split("\n").filter(Boolean)) {
    const [kod, ...yollar] = satir.split("\t");
    const dosya = yollar[yollar.length - 1];
    if (kod.startsWith("A") || kod.startsWith("C")) added.push(dosya);
    else if (kod.startsWith("D")) deleted.push(dosya);
    else modified.push(dosya);
  }
  let branch: string | null = null;
  try {
    branch = (await git(kok, ["rev-parse", "--abbrev-ref", "HEAD"])).trim() || null;
  } catch {
    branch = null; // henüz commit yok
  }
  const diller = new Set<string>();
  for (const f of [...added, ...modified]) {
    const d = DILLER[path.extname(f).toLowerCase()];
    if (d) diller.add(d);
  }
  const readme = diff
    .split(/^(?=diff --git )/m)
    .find((b) => /^diff --git a\/\S+ b\/(\S+\/)?readme(\.[a-z]+)?$/im.test(b.split("\n")[0]));
  return {
    repo_name: path.basename(kok),
    branch: branch === "HEAD" ? null : branch,
    commit_message: commitMesaji || null,
    added_files: added,
    modified_files: modified,
    deleted_files: deleted,
    readme_diff: readme ?? null,
    languages: [...diller],
  };
}

// ---------------------------------------------------------------- pre-commit hook

export const HOOK_ISARET = "# anladinmi-vscode-hook";
const CLI_ISARET = "# anladinmi-hook"; // cli/main.py'nin terminal hook'u: bunun üstüne yazabiliriz
export const BAGLANTI_DOSYASI = "anladinmi-vscode.json";

/** Hook: VS Code açıksa quiz'i orada açar ve bitmesini bekler; değilse commit'e karışmaz. */
const HOOK = `#!/bin/sh
${HOOK_ISARET}
# Anladın mı? VS Code eklentisi kurdu. Mavi Commit butonuna basınca quiz'i VS Code'da açar.
# VS Code kapalıysa ya da cevap gelmezse commit'e engel olmaz.
f="$(git rev-parse --absolute-git-dir)/${BAGLANTI_DOSYASI}"
[ -f "$f" ] || exit 0
port=$(sed -n 's/.*"port": *\\([0-9][0-9]*\\).*/\\1/p' "$f")
token=$(sed -n 's/.*"token": *"\\([^"]*\\)".*/\\1/p' "$f")
[ -n "$port" ] && [ -n "$token" ] || exit 0
cevap=$(curl -s --max-time 1800 -X POST -H "X-Anladinmi-Token: $token" "http://127.0.0.1:$port/quiz") || exit 0
if [ "$cevap" = "iptal" ]; then
  echo "Anladın mı?: commit iptal edildi." >&2
  exit 1
fi
exit 0
`;

export async function hookYolu(kok: string): Promise<string> {
  const klasor = (await git(kok, ["rev-parse", "--git-path", "hooks"])).trim();
  return path.resolve(kok, klasor, "pre-commit");
}

export async function hookDurumu(kok: string): Promise<"bizim" | "yok" | "cli" | "baska"> {
  const yol = await hookYolu(kok);
  if (!fs.existsSync(yol)) return "yok";
  const icerik = fs.readFileSync(yol, "utf8");
  if (icerik.includes(HOOK_ISARET)) return "bizim";
  if (icerik.includes(CLI_ISARET)) return "cli";
  return "baska";
}

export async function hookKur(kok: string): Promise<void> {
  const durum = await hookDurumu(kok);
  if (durum === "baska") {
    throw new GitHatasi("Bu repoda başka bir pre-commit hook var; üstüne yazmadım.");
  }
  const yol = await hookYolu(kok);
  fs.mkdirSync(path.dirname(yol), { recursive: true });
  fs.writeFileSync(yol, HOOK, { encoding: "utf8", mode: 0o755 });
}

export async function hookKaldir(kok: string): Promise<boolean> {
  if ((await hookDurumu(kok)) !== "bizim") return false;
  fs.unlinkSync(await hookYolu(kok));
  return true;
}

export async function gitKlasoru(kok: string): Promise<string> {
  return (await git(kok, ["rev-parse", "--absolute-git-dir"])).trim();
}
