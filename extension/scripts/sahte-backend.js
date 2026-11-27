// Sahte backend: backend/CLAUDE.md bölüm 4'teki sözleşmeye birebir uyar, Claude'a GİTMEZ (para harcamaz).
// Eklentiyi gerçek FastAPI hazır olmadan uçtan uca denemek için.
//
//   node scripts/sahte-backend.js            -> http://127.0.0.1:8765
//   node scripts/sahte-backend.js 9000       -> başka port
//
// Davranış:
//   - Diff'te anlamlı eklenen satır yoksa (sadece boşluk/yorum) questions: [] döner.
//   - Puanlama: cevap, sorunun expected_points'lerindeki anahtar kelimeleri ne kadar içeriyor.
//   - Geçme kuralı: her soru >= 0.6 ve ortalama >= 0.7 (backend/src/config.py ile aynı).
//   - Diff'te "YAVAS" geçerse 5 sn bekler, "HATA500" geçerse 502 döner (hata ekranlarını denemek için).

const http = require("http");
const crypto = require("crypto");

const PORT = Number(process.argv[2]) || 8765;
const oturumlar = new Map(); // session_id -> { questions (expected_points dahil) }

const SORU_HAVUZU = [
  {
    question: "`urun_ekle(urun, adet=1, sepet={})` iki kez sepet verilmeden çağrılırsa ikinci çağrı ne döndürür? Neden?",
    topic: "fonksiyonlar", line_hint: 6,
    expected_points: ["aynı sözlük", "paylaşılır", "bir kez", "önceki"],
    explanation: "`sepet={}` varsayılan değeri fonksiyon tanımlanırken **bir kez** oluşturulur. Sepet verilmeden yapılan her çağrı aynı sözlüğü kullanır, bu yüzden ikinci çağrı ilk ürünü de içerir. Çözüm: `sepet=None` alıp içeride `if sepet is None: sepet = {}` yazmak.",
  },
  {
    question: "`ortalama_fiyat({})` (boş sepet) çağrılırsa ne olur?",
    topic: "uç durumlar", line_hint: 24,
    expected_points: ["sıfır", "zerodivision", "bölme", "hata"],
    explanation: "Boş sepette `sum(sepet.values())` 0 döner ve `toplam(sepet) / toplam_adet` satırı sıfıra böler: `ZeroDivisionError`. Bölmeden önce `if toplam_adet == 0: return 0` gibi bir kontrol gerekir.",
  },
  {
    question: "`toplam()` fiyat listesinde olmayan bir ürünle (ör. \"muz\") karşılaşınca ne yapar? Bunun riski ne?",
    topic: "girdi doğrulama", line_hint: 15,
    expected_points: ["atlar", "continue", "sessiz", "eksik"],
    explanation: "`FIYATLAR.get(urun)` bilinmeyen ürün için `None` döner ve `continue` o ürünü **sessizce atlar**. Toplam eksik çıkar ama kimse fark etmez. Bir uyarı vermek ya da hata fırlatmak daha güvenli olur.",
  },
  {
    question: "İndirim kodu `\"ogrenci20\"` (küçük harfle) girilirse indirim uygulanır mı?",
    topic: "girdi doğrulama", line_hint: 19,
    expected_points: ["hayır", "uygulanmaz", "büyük", "küçük harf"],
    explanation: "Karşılaştırma `indirim_kodu == \"OGRENCI20\"` birebir yapılıyor, yani büyük/küçük harfe duyarlı. `\"ogrenci20\"` eşleşmez ve indirim uygulanmaz. `indirim_kodu.upper()` ile karşılaştırmak bunu çözer.",
  },
  {
    question: "`toplam()` sonucu neden `round(tutar, 2)` ile döndürülüyor?",
    topic: "sayılar", line_hint: 21,
    expected_points: ["ondalık", "kuruş", "float", "yuvarla"],
    explanation: "Ondalıklı sayılar (`float`) bilgisayarda tam temsil edilemez; `0.8` ile çarpınca `39.99999` gibi sonuçlar çıkabilir. `round(..., 2)` sonucu kuruş hassasiyetine yuvarlar.",
  },
];

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

function anlamliMi(diff) {
  return diff.split("\n").some((s) => {
    if (!s.startsWith("+") || s.startsWith("+++")) return false;
    const t = s.slice(1).trim();
    return t && !t.startsWith("#") && !t.startsWith("//");
  });
}

function puanla(cevap, beklenen) {
  const c = cevap.toLocaleLowerCase("tr");
  if (!c.trim()) return 0;
  const isabet = beklenen.filter((k) => c.includes(k.toLocaleLowerCase("tr"))).length;
  return [0, 0.6, 0.85, 1][Math.min(isabet, 3)]; // hiç isabet yoksa 0: yanlış cevap puan almaz
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

    const dosya = (context.added_files ?? [])[0] ?? (context.modified_files ?? [])[0] ?? "sepet.py";
    const sorular = anlamliMi(diff)
      ? SORU_HAVUZU.slice(0, n).map((s, i) => ({ id: `q${i + 1}`, file: dosya, ...s }))
      : [];
    const session_id = crypto.randomUUID();
    oturumlar.set(session_id, sorular);
    // expected_points ve explanation backend'de kalır, eklentiye gönderilmez.
    return [200, { session_id, questions: sorular.map(({ expected_points, explanation, ...g }) => g) }];
  }

  if (yol === "POST /evaluate") {
    const { session_id, answers } = govde ?? {};
    const sorular = oturumlar.get(session_id);
    if (!sorular) return [404, { detail: "Oturum bulunamadı ya da süresi doldu. Soruları yeniden iste." }];
    if (!Array.isArray(answers)) return [422, { detail: "answers listesi zorunlu" }];
    await bekle(1500);
    const results = sorular.map((s) => {
      const cevap = answers.find((a) => a.question_id === s.id)?.answer ?? "";
      const score = Math.round(puanla(cevap, s.expected_points) * 100) / 100;
      const correct = score >= 0.6;
      return {
        question_id: s.id, correct, score,
        feedback: correct ? "Doğru, ana noktayı yakalamışsın." : cevap.trim() ? "Bu cevap kodun davranışını kaçırıyor." : "Boş bıraktın; birlikte bakalım.",
        explanation: correct ? null : s.explanation,
      };
    });
    const ort = results.reduce((t, r) => t + r.score, 0) / Math.max(results.length, 1);
    return [200, { passed: results.every((r) => r.score >= 0.6) && ort >= 0.7, score: Math.round(ort * 100) / 100, results }];
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
