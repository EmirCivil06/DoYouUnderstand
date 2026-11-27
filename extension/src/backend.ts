// Backend (FastAPI) istemcisi. Sözleşme: backend/CLAUDE.md bölüm 4 (backend/src/schemas.py ile aynı).
// Backend'in sonuç biçimi burada eklentinin iç biçimine (Sonuc) çevrilir; ekran sadece Sonuc'u bilir.
// vscode'a bağlı DEĞİL: Node ile tek başına test edilebilir.
import { ORNEK_SORULAR, OrnekSoru } from "./ornekSorular";

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

export interface Secenek {
  id: string; // backend: "a".."e" (ekranda büyük harf gösterilir)
  text: string;
}

/**
 * Kullanıcıya gösterilen soru. expected_points ve doğru şık BİLEREK yok: cevaplamadan önce
 * kullanıcıya asla gösterilmez. options doluysa çoktan seçmeli, boşsa açık uçlu.
 */
export interface Soru {
  id: string;
  question: string;
  file: string;
  line_hint: number | null;
  topic: string;
  options: Secenek[];
}

export interface SoruYaniti {
  session_id: string;
  questions: Soru[];
  /** Diff çok büyük olduğu için backend'in dışarıda bıraktığı (soru sorulmayan) dosyalar. */
  omitted_files: string[];
}

/** Backend'in /evaluate yanıtındaki tek sonuç (backend/src/schemas.py AnswerResult). */
interface BackendSonuc {
  question_id: string;
  chosen_option: string | null;
  correct_option: string;
  correct: boolean;
  options: { id: string; text: string; is_correct: boolean; explanation: string }[];
}

/** Backend sonucunu ekranın biçimine çevir: doğrunun açıklaması + her yanlış şıkkın açıklaması. */
export function sonucCevir(r: BackendSonuc): Sonuc {
  const secenekler = Array.isArray(r.options) ? r.options : [];
  const dogru = secenekler.find((o) => o.is_correct) ?? secenekler.find((o) => o.id === r.correct_option);
  return {
    question_id: r.question_id,
    correct: !!r.correct,
    score: r.correct ? 1 : 0,
    feedback: "",
    explanation: dogru?.explanation ?? null,
    correct_option: r.correct_option ?? dogru?.id ?? null,
    option_explanations: Object.fromEntries(
      secenekler.filter((o) => o !== dogru).map((o) => [o.id, String(o.explanation ?? "")])
    ),
  };
}

export interface Sonuc {
  question_id: string;
  correct: boolean;
  score: number;
  feedback: string;
  /** Çoktan seçmelide: doğru şık neden doğru. Açık uçluda: yanlışsa kodun açıklaması. */
  explanation: string | null;
  /** Çoktan seçmeli: doğru şıkkın id'si ("C"). */
  correct_option?: string | null;
  /** Çoktan seçmeli: her YANLIŞ şık aslında ne yapar / neden yanlış. { "A": "...", ... } */
  option_explanations?: Record<string, string>;
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
      // Güvenlik ağı: backend doğru şık / açıklama gönderse bile sadece gösterilecek
      // alanları alırız (beyaz liste).
      return {
        session_id: y.session_id,
        omitted_files: Array.isArray(y.omitted_files) ? y.omitted_files.map(String) : [],
        questions: (y.questions ?? []).map(({ id, question, file, line_hint, topic, options }) => ({
          id, question, file, line_hint: line_hint ?? null, topic,
          options: Array.isArray(options) ? options.map((o) => ({ id: String(o.id), text: String(o.text) })) : [],
        })),
      };
    },
    async degerlendir(sessionId, cevaplar) {
      // Backend şık id'sini option_id alanında bekler; boş cevap = null (yanlış sayılır).
      const y = await istek<{ passed: boolean; score: number; results: BackendSonuc[] }>("/evaluate", {
        session_id: sessionId,
        answers: cevaplar.map((c) => ({ question_id: c.question_id, option_id: c.answer.trim() || null })),
      });
      // Backend oturumdaki TÜM soruları döndürür (cevaplanmayanlar yanlış); biz sadece
      // gönderdiklerimizi alırız, geçme durumunu ekran kendisi hesaplar.
      const istenen = new Set(cevaplar.map((c) => c.question_id));
      return {
        passed: !!y.passed,
        score: Number(y.score) || 0,
        results: (y.results ?? []).filter((r) => istenen.has(r.question_id)).map(sonucCevir),
      };
    },
  };
}

// ---------------------------------------------------------------- mock backend

const bekle = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Çoktan seçmeli değerlendirme: tek doğru şık, 1 ya da 0 puan. Mock ve sahte backend ortak kullanır. */
export function coktanDegerlendir(soru: OrnekSoru, qid: string, cevap: string): Sonuc {
  const secilen = cevap.trim().toUpperCase().slice(0, 1);
  const correct = secilen === soru.correct_option.toUpperCase();
  return {
    question_id: qid,
    correct,
    score: correct ? 1 : 0,
    feedback: correct
      ? "Doğru!"
      : secilen
        ? `Senin cevabın ${secilen}, doğru cevap ${soru.correct_option}.`
        : `Boş bıraktın; doğru cevap ${soru.correct_option}.`,
    explanation: soru.explanation,
    correct_option: soru.correct_option,
    option_explanations: soru.option_explanations,
  };
}

export function gecti(results: Sonuc[]): DegerlendirmeYaniti {
  const score = results.reduce((t, r) => t + r.score, 0) / Math.max(results.length, 1);
  return { passed: results.every((r) => r.score >= 0.6) && score >= 0.7, score, results };
}

/** Backend hazır değilken arayüzü geliştirmek ve demoyu yedeklemek için. Claude'a gitmez. */
export function mockBackend(): Backend {
  let son: { id: string; ornek: OrnekSoru }[] = [];
  return {
    async saglik() {},
    async sorular(_diff, context, params) {
      await bekle(700);
      const dosya = context.added_files[0] ?? context.modified_files[0] ?? "sepet.py";
      son = ORNEK_SORULAR.slice(0, params.num_questions).map((ornek, i) => ({ id: `q${i + 1}`, ornek }));
      return {
        session_id: "mock-" + Date.now(),
        omitted_files: [],
        questions: son.map(({ id, ornek }) => ({
          id, question: ornek.question, file: dosya, line_hint: ornek.line_hint, topic: ornek.topic, options: ornek.options,
        })),
      };
    },
    async degerlendir(_sessionId, cevaplar) {
      await bekle(400);
      // Sadece gönderilen cevapları değerlendir (eklenti her soruyu tek tek yollar).
      return gecti(cevaplar.flatMap((c) => {
        const s = son.find((x) => x.id === c.question_id);
        return s ? [coktanDegerlendir(s.ornek, s.id, c.answer)] : [];
      }));
    },
  };
}
