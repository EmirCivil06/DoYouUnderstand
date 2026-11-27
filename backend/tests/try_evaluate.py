"""Manual test: grade a good, a partial and a wrong answer via src.ai.cevap_degerlendir (~$0.001).

Run: .venv\\Scripts\\python tests/try_evaluate.py
"""
from claude_common import SAMPLE_DIFF, run_guarded

from src.ai import cevap_degerlendir
from src.schemas import Question

QUESTION = Question(
    id="q1",
    question="average_price() boş bir liste ile çağrılırsa ne olur?",
    file="src/sepet.py",
    line_hint=8,
    topic="uç durumlar",
    expected_points=["ZeroDivisionError fırlatır", "len(items) 0 olduğu için bölme hatası"],
)

# (answer, minimum score, maximum score)
CASES = [
    ("ZeroDivisionError verir çünkü sıfıra bölüyor.", 0.7, 1.0),
    ("Hata verir sanırım.", 0.2, 0.8),
    ("0 döndürür.", 0.0, 0.4),
]


def main():
    failures = 0
    for answer, lo, hi in CASES:
        g = cevap_degerlendir(SAMPLE_DIFF, QUESTION, answer)
        ok = lo <= g.score <= hi
        failures += not ok
        print(f"\nAnswer: {answer!r}\n  score={g.score} correct={g.correct} "
              f"expected {lo}-{hi} -> {'PASS' if ok else 'FAIL'}\n  {g.feedback}")
    print("\nOK" if not failures else f"\n{failures} case(s) outside expected range")
    raise SystemExit(1 if failures else 0)


if __name__ == "__main__":
    run_guarded(main)
