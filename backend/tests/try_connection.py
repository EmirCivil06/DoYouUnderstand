"""Smoke test: can we reach the Claude API with our key? (~$0.00001)

Run: .venv\\Scripts\\python tests/try_connection.py
"""
from claude_common import run_guarded

from src import config
from src.ai import get_client


def main():
    response = get_client().messages.create(
        model=config.MODEL,
        max_tokens=200,
        output_config={"effort": "low"},
        messages=[{"role": "user", "content": "Sadece 'pong' yaz."}],
    )
    text = next((b.text for b in response.content if b.type == "text"), "")
    print("Reply:", text.strip())
    print(f"stop_reason={response.stop_reason} model={response.model}")
    print("OK")


if __name__ == "__main__":
    run_guarded(main)
