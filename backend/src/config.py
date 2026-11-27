"""Central settings. Values marked (env) can be overridden in backend/.env."""
import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")

MODEL = os.getenv("CLAUDE_MODEL", "claude-haiku-5-5")  # (env)

QUESTION_EFFORT = "medium"
QUESTION_MAX_TOKENS = 4000
EVAL_EFFORT = "low"
EVAL_MAX_TOKENS = 2000

# Haiku 5.5 pricing, $ per 1M tokens (prompts < 100K tokens). Used only for cost logging.
PRICE_IN, PRICE_OUT = 0.10, 0.50

HOST, PORT = "127.0.0.1", 8765


def api_key() -> str | None:
    return os.getenv("ANTHROPIC_API_KEY") or os.getenv("API_KEY")
