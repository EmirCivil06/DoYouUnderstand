// VS Code'un yerleşik Git eklentisiyle konuşur: staged diff, bağlam, commit.
import * as path from "path";
import * as vscode from "vscode";
import type { DiffContext } from "./backend";

// --- vscode.git API'sinin kullandığımız küçük bir parçası (resmi git.d.ts'ten) ---
const enum Status {
  INDEX_MODIFIED = 0,
  INDEX_ADDED = 1,
  INDEX_DELETED = 2,
  INDEX_RENAMED = 3,
  INDEX_COPIED = 4,
}

interface Change {
  readonly uri: vscode.Uri;
  readonly originalUri: vscode.Uri;
  readonly status: Status;
}

export interface Repository {
  readonly rootUri: vscode.Uri;
  readonly inputBox: { value: string };
  readonly state: {
    readonly HEAD: { readonly name?: string } | undefined;
    readonly indexChanges: Change[];
  };
  diff(cached?: boolean): Promise<string>;
  commit(message: string): Promise<void>;
}

interface GitAPI {
  readonly repositories: Repository[];
}

export class GitHatasi extends Error {}

function gitApi(): GitAPI {
  const ext = vscode.extensions.getExtension<{ getAPI(v: 1): GitAPI }>("vscode.git");
  if (!ext || !ext.isActive) {
    throw new GitHatasi("VS Code'un Git eklentisi etkin değil.");
  }
  return ext.exports.getAPI(1);
}

/** Komut Kaynak Denetimi panelinden çağrıldıysa o repoyu, değilse tek repoyu ya da seçileni döndürür. */
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

// Lock dosyaları soru üretmek için gürültü; diff'ten çıkarılır (CLI ile aynı kural).
const HARIC = [/\.lock$/i, /(^|\/)package-lock\.json$/i];

/** Diff'i dosya bloklarına böler: "diff --git a/x b/x" -> blok. */
function bloklar(diff: string): { dosya: string; metin: string }[] {
  const parcalar = diff.split(/^(?=diff --git )/m).filter((p) => p.trim());
  return parcalar.map((metin) => {
    const m = /^diff --git a\/(.+?) b\/(.+)$/m.exec(metin);
    return { dosya: m ? m[2] : "", metin };
  });
}

export async function stagedDiff(repo: Repository): Promise<string> {
  const ham = await repo.diff(true);
  const temiz = bloklar(ham)
    .filter((b) => !HARIC.some((re) => re.test(b.dosya)))
    .map((b) => b.metin)
    .join("");
  if (!temiz.trim()) {
    throw new GitHatasi("Staged değişiklik yok. Önce dosyaları stage et (+ butonu ya da git add).");
  }
  return temiz;
}

const DILLER: Record<string, string> = {
  ".py": "python", ".ts": "typescript", ".tsx": "typescript", ".js": "javascript", ".jsx": "javascript",
  ".java": "java", ".kt": "kotlin", ".cs": "csharp", ".go": "go", ".rs": "rust", ".rb": "ruby",
  ".php": "php", ".c": "c", ".h": "c", ".cpp": "cpp", ".hpp": "cpp", ".swift": "swift",
  ".dart": "dart", ".sql": "sql", ".html": "html", ".css": "css", ".sh": "shell", ".ps1": "powershell",
};

export function baglamKur(repo: Repository, diff: string, commitMesaji: string): DiffContext {
  const rel = (u: vscode.Uri) => path.relative(repo.rootUri.fsPath, u.fsPath).replace(/\\/g, "/");
  const added: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];
  for (const c of repo.state.indexChanges) {
    if (c.status === Status.INDEX_ADDED || c.status === Status.INDEX_COPIED) added.push(rel(c.uri));
    else if (c.status === Status.INDEX_DELETED) deleted.push(rel(c.uri));
    else modified.push(rel(c.uri));
  }
  const diller = new Set<string>();
  for (const f of [...added, ...modified]) {
    const d = DILLER[path.extname(f).toLowerCase()];
    if (d) diller.add(d);
  }
  const readme = bloklar(diff).find((b) => /(^|\/)readme(\.[a-z]+)?$/i.test(b.dosya));
  return {
    repo_name: path.basename(repo.rootUri.fsPath),
    branch: repo.state.HEAD?.name ?? null,
    commit_message: commitMesaji || null,
    added_files: added,
    modified_files: modified,
    deleted_files: deleted,
    readme_diff: readme ? readme.metin : null,
    languages: [...diller],
  };
}
