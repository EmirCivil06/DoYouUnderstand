"""System prompts and user-message builders.

System prompts must stay constant (no dates/UUIDs) so prompt caching can work.
"""
import json

from .schemas import DiffContext, Question, QuestionParams

QUESTION_SYSTEM = (
    "Sen bir kod inceleme öğretmenisin. Verilen git diff'i için açık uçlu, somut koda "
    "bağlı (dosya + fonksiyon adı geçen) sorular üret: uç durumlar (boş girdi, None, sınır "
    "değerleri), hata yolları, yan etkiler, 'bu satır neden var?', karmaşıklık. "
    "Her soru tek cümlelik bir cevapla yanıtlanabilmeli. Ezber/sözdizimi ya da genel "
    "programlama bilgisi sorma. README/config gibi kod dışı değişikliklere en fazla 1 soru ayır. "
    "Önemsiz diff'te (yalnızca boşluk/yorum/format) boş liste dön. "
    "Metinleri kullanıcı mesajında belirtilen dilde yaz."
)

EVAL_SYSTEM = (
    "Bir öğrencinin, bir git diff'i hakkındaki soruya verdiği cevabı değerlendir. "
    "Anlam odaklı puanla (yazım/dil hatası puan kırmaz), kısmi doğruya kısmi puan ver; "
    "score 0.0 ile 1.0 arasında olsun. Cevap yanlış ya da eksikse ilgili kod parçasını yeni "
    "başlayan birine anlatır gibi Türkçe açıkla (explanation); doğruysa explanation boş kalsın."
)


def question_message(diff: str, context: DiffContext, params: QuestionParams) -> str:
    parts = [
        f"{params.num_questions} soru üret. Zorluk: {params.difficulty}. Dil: {params.language}."
    ]
    if params.focus_topics:
        parts.append("Öncelikli konular: " + ", ".join(params.focus_topics))
    ctx = context.model_dump(exclude_defaults=True)
    if ctx:
        parts.append(f"<context>\n{json.dumps(ctx, ensure_ascii=False, indent=2)}\n</context>")
    parts.append(f"<diff>\n{diff}\n</diff>")
    return "\n\n".join(parts)


def eval_message(diff: str, question: Question, answer: str) -> str:
    return (
        f"<diff>\n{diff}\n</diff>\n\n"
        f"Soru ({question.file}): {question.question}\n"
        f"Beklenen noktalar: {json.dumps(question.expected_points, ensure_ascii=False)}\n"
        f"Cevap: {answer}"
    )
