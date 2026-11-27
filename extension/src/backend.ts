// Backend (FastAPI) istemcisi. Sözleşme: backend/CLAUDE.md bölüm 4.
// vscode'a bağlı DEĞİL: Node ile tek başına test edilebilir.

export interface DiffContext {
  repo_name: string | null;
  branch: string | null;
  commit_message: string | null;
  added_files: string[];
  modified_files: string[];
  deleted_files: string[];
  readme_diff: string | null;
  languages: string[];
}

export interface QuestionParams {
  num_questions: number;
  difficulty: "kolay" | "orta" | "zor";
  language: string;
  focus_topics: string[];
}

/** Kullanıcıya gösterilen soru. expected_points BİLEREK yok: kullanıcıya asla gösterilmez. */
export interface Soru {
  id: string;
  question: string;
  file: string;
  line_hint: number | null;
  topic: string;
}

export interface SoruYaniti {
  session_id: string;
  questions: Soru[];
}

export interface Sonuc {
  question_id: string;
  correct: boolean;
  score: number;
  feedback: string;
  explanation: string | null;
}

export interface DegerlendirmeYaniti {
  passed: boolean;
  score: number;
  results: Sonuc[];
}

export class BackendHatasi extends Error {
  constructor(message: string, readonly ulasilamadi = false) {
    super(message);
  }
}

export interface Backend {
  saglik(): Promise<void>;
  sorular(diff: string, context: DiffContext, params: QuestionParams): Promise<SoruYaniti>;
  degerlendir(sessionId: string, cevaplar: { question_id: string; answer: string }[]): Promise<DegerlendirmeYaniti>;
}

// ---------------------------------------------------------------- gerçek backend

export function httpBackend(baseUrl: string, zamanAsimiMs = 90_000): Backend {
  const kok = baseUrl.replace(/\/+$/, "");

  async function istek<T>(yol: string, govde?: unknown, ms = zamanAsimiMs): Promise<T> {
    let yanit: Response;
    try {
      yanit = await fetch(kok + yol, {
        method: govde === undefined ? "GET" : "POST",
        headers: govde === undefined ? undefined : { "Content-Type": "application/json" },
        body: govde === undefined ? undefined : JSON.stringify(govde),
        signal: AbortSignal.timeout(ms),
      });
    } catch (e) {
      const zamanAsimi = e instanceof Error && e.name === "TimeoutError";
      throw new BackendHatasi(
        zamanAsimi
          ? "Backend zamanında cevap vermedi. Biraz bekleyip tekrar dene."
          : `Backend'e ulaşılamadı (${kok}). Sunucu çalışıyor mu? (backend klasöründe: python main.py)`,
        !zamanAsimi
      );
    }
    if (!yanit.ok) {
      // FastAPI hataları {"detail": "..."} döner; backend Türkçe mesaj koyuyor.
      let detay = "";
      try {
        const j = (await yanit.json()) as { detail?: unknown };
        detay = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail ?? j);
      } catch {
        /* gövde JSON değil */
      }
      throw new BackendHatasi(`Backend hatası (${yanit.status})${detay ? ": " + detay : ""}`);
    }
    return (await yanit.json()) as T;
  }

  return {
    async saglik() {
      const j = await istek<{ ok?: boolean }>("/health", undefined, 3_000);
      if (!j.ok) throw new BackendHatasi("Backend sağlıklı değil (/health ok:false).");
    },
    async sorular(diff, context, params) {
      const y = await istek<SoruYaniti>("/questions", { diff, context, params });
      // Güvenlik ağı: backend expected_points'i çıkarmayı unutursa biz atarız.
      return {
        session_id: y.session_id,
        questions: (y.questions ?? []).map(({ id, question, file, line_hint, topic }) => ({
          id, question, file, line_hint: line_hint ?? null, topic,
        })),
      };
    },
    async degerlendir(sessionId, cevaplar) {
      return istek<DegerlendirmeYaniti>("/evaluate", { session_id: sessionId, answers: cevaplar });
    },
  };
}

// ---------------------------------------------------------------- mock backend

const bekle = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Backend hazır değilken arayüzü geliştirmek ve demoyu yedeklemek için. Claude'a gitmez. */
export function mockBackend(): Backend {
  let son: Soru[] = [];
  return {
    async saglik() {},
    async sorular(_diff, context, params) {
      await bekle(700);
      const dosya = context.added_files[0] ?? context.modified_files[0] ?? "kod";
      const havuz: Omit<Soru, "id">[] = [
        { question: `${dosya} dosyasındaki yeni fonksiyona boş bir girdi (boş liste / boş sözlük) gelirse ne olur?`, file: dosya, line_hint: null, topic: "uç durumlar" },
        { question: `Bu değişiklikteki bir fonksiyona None verilirse hangi satırda ve neden hata alınır?`, file: dosya, line_hint: null, topic: "hata yönetimi" },
        { question: `Bu commit'te eklenen kod mevcut davranışı nasıl değiştiriyor? Bir cümleyle anlat.`, file: dosya, line_hint: null, topic: "genel anlama" },
        { question: `Bu değişiklikte varsayılan değeri olan bir parametre var mı? Varsa çağrılar arasında nasıl davranır?`, file: dosya, line_hint: null, topic: "fonksiyonlar" },
        { question: `Bu kodu test etmek için yazacağın ilk test ne olurdu?`, file: dosya, line_hint: null, topic: "test" },
      ];
      son = havuz.slice(0, params.num_questions).map((s, i) => ({ id: `q${i + 1}`, ...s }));
      return { session_id: "mock-" + Date.now(), questions: son };
    },
    async degerlendir(_sessionId, cevaplar) {
      await bekle(900);
      const results: Sonuc[] = cevaplar.map((c) => {
        const uzun = c.answer.trim().length >= 25;
        return {
          question_id: c.question_id,
          correct: uzun,
          score: uzun ? 0.8 : 0.3,
          feedback: uzun ? "(Mock) Cevabın yeterince ayrıntılı görünüyor." : "(Mock) Cevap çok kısa ya da eksik.",
          explanation: uzun
            ? null
            : "(Mock) Gerçek backend burada ilgili kodu yeni başlayan birine anlatır gibi açıklayacak. " +
              "Örneğin `sum(sepet.values())` boş sepette 0 döner ve ardından gelen bölme `ZeroDivisionError` verir.",
        };
      });
      const score = results.reduce((t, r) => t + r.score, 0) / Math.max(results.length, 1);
      return { passed: results.every((r) => r.score >= 0.6) && score >= 0.7, score, results };
    },
  };
}
