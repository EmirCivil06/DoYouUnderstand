// Sahte backend: backend/CLAUDE.md bölüm 4 + çoktan seçmeli eki (extension/README.md) ile birebir uyumlu.
// Claude'a GİTMEZ (para harcamaz). Eklentiyi gerçek FastAPI hazır olmadan uçtan uca denemek için.
//
//   npm run compile                          (sorular out/ornekSorular.js'ten okunur)
//   node scripts/sahte-backend.js            -> http://127.0.0.1:8765
//   node scripts/sahte-backend.js 9000       -> başka port
//
// Davranış:
//   - params.question_type "open" ise açık uçlu, yoksa 5 şıklı çoktan seçmeli sorar.
//   - Diff'te anlamlı eklenen satır yoksa (sadece boşluk/yorum) questions: [] döner.
//   - Doğru şık ve açıklamalar backend'de kalır; sadece /evaluate yanıtında döner.
//   - Diff'te "YAVAS" geçerse 5 sn bekler, "HATA500" geçerse 502 döner (hata ekranlarını denemek için).

const http = require("http");
const crypto = require("crypto");
const path = require("path");

const out = path.join(__dirname, "..", "out");
const { ORNEK_SORULAR } = require(path.join(out, "ornekSorular.js"));
const { coktanDegerlendir, gecti } = require(path.join(out, "backend.js"));

const PORT = Number(process.argv[2]) || 8765;
const oturumlar = new Map(); // session_id -> { tip, sorular: [{ id, ornek }] }

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

function anlamliMi(diff) {
  return diff.split("\n").some((s) => {
    if (!s.startsWith("+") || s.startsWith("+++")) return false;
    const t = s.slice(1).trim();
    return t && !t.startsWith("#") && !t.startsWith("//");
  });
}

// Açık uçlu mod (eski sözleşme): doğru şıkkın açıklamasındaki kelimelerle kaba puanlama.
function acikDegerlendir(ornek, qid, cevap) {
  const c = cevap.toLocaleLowerCase("tr");
  const dogruMetin = ornek.options.find((o) => o.id === ornek.correct_option).text.toLocaleLowerCase("tr");
  const kelimeler = dogruMetin.replace(/[`"(){}.,:;]/g, " ").split(/\s+/).filter((k) => k.length > 3);
  const isabet = kelimeler.filter((k) => c.includes(k)).length;
  const correct = c.trim() !== "" && isabet >= Math.min(2, kelimeler.length);
  return {
    question_id: qid, correct, score: correct ? 1 : 0,
    feedback: correct ? "Doğru, ana noktayı yakalamışsın." : c.trim() ? "Bu cevap kodun davranışını kaçırıyor." : "Boş bıraktın; birlikte bakalım.",
    explanation: correct ? null : ornek.explanation,
  };
}

async function yonlendir(yol, govde) {
  if (yol === "GET /health") return [200, { ok: true }];

  if (yol === "POST /questions") {
    const { diff, context = {}, params = {} } = govde ?? {};
    if (typeof diff !== "string") return [422, { detail: "diff alanı zorunlu" }];
    const n = params.num_questions ?? 3;
    if (n < 1 || n > 5) return [422, { detail: "num_questions 1 ile 5 arasında olmalı" }];
    if (diff.includes("HATA500")) return [502, { detail: "Claude API şu an yanıt vermiyor, biraz sonra tekrar dene." }];
    await bekle(diff.includes("YAVAS") ? 5000 : 1200);

    const tip = params.question_type === "open" ? "open" : "multiple_choice";
    const dosya = (context.added_files ?? [])[0] ?? (context.modified_files ?? [])[0] ?? "sepet.py";
    const sorular = anlamliMi(diff) ? ORNEK_SORULAR.slice(0, n).map((ornek, i) => ({ id: `q${i + 1}`, ornek })) : [];
    const session_id = crypto.randomUUID();
    oturumlar.set(session_id, { tip, sorular });
    return [200, {
      session_id,
      questions: sorular.map(({ id, ornek }) => ({
        id, question: ornek.question, file: dosya, line_hint: ornek.line_hint, topic: ornek.topic,
        ...(tip === "multiple_choice" ? { options: ornek.options } : {}),
      })),
    }];
  }

  if (yol === "POST /evaluate") {
    const { session_id, answers } = govde ?? {};
    const oturum = oturumlar.get(session_id);
    if (!oturum) return [404, { detail: "Oturum bulunamadı ya da süresi doldu. Soruları yeniden iste." }];
    if (!Array.isArray(answers)) return [422, { detail: "answers listesi zorunlu" }];
    await bekle(1000);
    const degerlendir = oturum.tip === "open" ? acikDegerlendir : coktanDegerlendir;
    return [200, gecti(oturum.sorular.map(({ id, ornek }) =>
      degerlendir(ornek, id, answers.find((a) => a.question_id === id)?.answer ?? "")))];
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
