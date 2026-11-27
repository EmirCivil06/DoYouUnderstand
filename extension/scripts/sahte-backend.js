// Sahte backend: gerçek backend'in (backend/src/api.py + schemas.py) istek/yanıt biçimini birebir
// taklit eder ama Claude'a GİTMEZ (para harcamaz). Eklentiyi API anahtarı olmadan denemek için.
//
//   npm run compile                          (sorular out/ornekSorular.js'ten okunur)
//   node scripts/sahte-backend.js            -> http://127.0.0.1:8765
//   node scripts/sahte-backend.js 9000       -> başka port
//
// Davranış (gerçek backend gibi):
//   - params.num_questions (1–5, varsayılan 3) kadar soru, her biri 5 şık (a–e), tek doğru.
//   - Diff'te anlamlı eklenen satır yoksa (sadece boşluk/yorum) questions: [] döner.
//   - Doğru şık ve açıklamalar sadece /evaluate yanıtında döner. /evaluate oturumdaki TÜM
//     soruları döndürür; cevaplanmayanlar yanlış sayılır.
// Denemek için: diff'te "YAVAS" -> 5 sn bekler, "HATA500" -> 502, "BUYUK" -> omitted_files dolu.

const http = require("http");
const crypto = require("crypto");
const path = require("path");

const { ORNEK_SORULAR } = require(path.join(__dirname, "..", "out", "ornekSorular.js"));

const PORT = Number(process.argv[2]) || 8765;
const oturumlar = new Map(); // session_id -> [{ id, correct_option, options: [{id,text,explanation}] }]

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

function anlamliMi(diff) {
  return diff.split("\n").some((s) => {
    if (!s.startsWith("+") || s.startsWith("+++")) return false;
    const t = s.slice(1).trim();
    return t && !t.startsWith("#") && !t.startsWith("//");
  });
}

/** Örnek soruyu backend'in iç biçimine çevir: küçük harf id, her şıkta açıklama. */
function backendSorusu(ornek, id) {
  return {
    id,
    question: ornek.question,
    line_hint: ornek.line_hint,
    topic: ornek.topic,
    correct_option: ornek.correct_option.toLowerCase(),
    options: ornek.options.map((o) => ({
      id: o.id.toLowerCase(),
      text: o.text,
      explanation: o.id === ornek.correct_option ? ornek.explanation : ornek.option_explanations[o.id],
    })),
  };
}

async function yonlendir(yol, govde) {
  if (yol === "GET /health") return [200, { ok: true }];

  if (yol === "POST /questions") {
    const { diff, context = {}, params = {} } = govde ?? {};
    if (typeof diff !== "string" || !diff) return [422, { detail: "diff alanı zorunlu" }];
    const n = params.num_questions ?? 3;
    if (!Number.isInteger(n) || n < 1 || n > 5) return [422, { detail: "num_questions 1 ile 5 arasında olmalı" }];
    if (diff.includes("HATA500")) return [502, { detail: "Claude API hata döndü (500)." }];
    await bekle(diff.includes("YAVAS") ? 5000 : 1200);

    const dosya = (context.added_files ?? [])[0] ?? (context.modified_files ?? [])[0] ?? "sepet.py";
    const sorular = anlamliMi(diff) ? ORNEK_SORULAR.slice(0, n).map((o, i) => backendSorusu(o, `q${i + 1}`)) : [];
    const session_id = crypto.randomUUID();
    oturumlar.set(session_id, sorular);
    return [200, {
      session_id,
      questions: sorular.map((q) => ({
        id: q.id, question: q.question, file: dosya, line_hint: q.line_hint, topic: q.topic,
        options: q.options.map((o) => ({ id: o.id, text: o.text })),
      })),
      omitted_files: diff.includes("BUYUK") ? ["veri/buyuk.json", "package-lock.json"] : [],
    }];
  }

  if (yol === "POST /evaluate") {
    const { session_id, answers } = govde ?? {};
    const sorular = oturumlar.get(session_id);
    if (!sorular) return [404, { detail: "Oturum bulunamadı ya da süresi doldu; soruları yeniden isteyin." }];
    if (!Array.isArray(answers)) return [422, { detail: "answers listesi zorunlu" }];
    const secilen = {};
    for (const a of answers) {
      const q = sorular.find((s) => s.id === a.question_id);
      if (!q) return [422, { detail: `Bilinmeyen soru: ${a.question_id}` }];
      const opt = a.option_id ?? null;
      if (opt !== null && !q.options.some((o) => o.id === opt)) return [422, { detail: `Bilinmeyen şık: ${a.question_id} / ${opt}` }];
      secilen[a.question_id] = opt;
    }
    await bekle(300);
    const results = sorular.map((q) => ({
      question_id: q.id,
      chosen_option: secilen[q.id] ?? null,
      correct_option: q.correct_option,
      correct: secilen[q.id] === q.correct_option,
      options: q.options.map((o) => ({ ...o, is_correct: o.id === q.correct_option })),
    }));
    const score = results.length ? Math.round((results.filter((r) => r.correct).length / results.length) * 1000) / 1000 : 1;
    return [200, { passed: score >= 0.66, score, results }];
  }

  return [404, { detail: "Not Found" }];
}

http.createServer((req, res) => {
  let ham = "";
  req.on("data", (c) => (ham += c));
  req.on("end", async () => {
    let govde = null;
    try { govde = ham ? JSON.parse(ham) : null; } catch { /* aşağıda 422 */ }
    const [kod, json] = ham && govde === null ? [422, { detail: "Geçersiz JSON" }] : await yonlendir(`${req.method} ${req.url}`, govde);
    console.log(`${new Date().toLocaleTimeString("tr")}  ${req.method} ${req.url} -> ${kod}`);
    res.writeHead(kod, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(json));
  });
}).listen(PORT, "127.0.0.1", () => console.log(`Sahte backend hazır: http://127.0.0.1:${PORT}  (Claude'a gitmez)`));
