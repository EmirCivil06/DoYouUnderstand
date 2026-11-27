"""Manual test: generate questions for a diff via src.ai.soru_uret (~$0.001).

Run: .venv\\Scripts\\python tests/try_questions.py [path/to/file.diff]
"""
import sys
from pathlib import Path

from claude_common import SAMPLE_DIFF, run_guarded

from src.ai import soru_uret


def main():
    diff = Path(sys.argv[1]).read_text(encoding="utf-8") if len(sys.argv) > 1 else SAMPLE_DIFF
    questions = soru_uret(diff)
    for q in questions:
        print(f"\n[{q.id}] ({q.topic}) {q.file}:{q.line_hint}\n  {q.question}")
        for p in q.expected_points:
            print(f"    - {p}")
    assert 1 <= len(questions) <= 5, f"unexpected question count: {len(questions)}"
    print("\nOK")


if __name__ == "__main__":
    run_guarded(main)
