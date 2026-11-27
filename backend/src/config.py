"""Central settings. Values marked (env) can be overridden in backend/.env."""
import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")

MODEL = os.getenv("CLAUDE_MODEL", "claude-haiku-5-5")  # (env)

# Quiz format: NUM_QUESTIONS multiple-choice questions, NUM_OPTIONS options each, one correct.
NUM_QUESTIONS = 3
NUM_OPTIONS = 4
OPTION_IDS = ("a", "b", "c", "d")  # assigned by the backend after shuffling

QUESTION_EFFORT = "medium"
# Thinking + 3 questions x 4 options with an explanation each; truncation costs a retry.
QUESTION_MAX_TOKENS = 6000

# Haiku 5.5 pricing, $ per 1M tokens (prompts < 100K tokens). Used only for cost logging.
PRICE_IN, PRICE_OUT = 0.10, 0.50

HOST, PORT = "127.0.0.1", 8765


def api_key() -> str | None:
    return os.getenv("ANTHROPIC_API_KEY") or os.getenv("API_KEY")

# Pass rule (see CLAUDE.md section 4): fraction of correct answers >= PASS_RATIO
# (2 of 3 passes). The commit is never blocked; this only decides which feedback is shown.
PASS_RATIO = 0.66

# In-memory sessions (src/session.py) expire after this many seconds.
SESSION_TTL_SECONDS = 60 * 60
SESSION_MAX_COUNT = 200

# Large diffs (src/diffs.py): above this many tokens, lowest-priority files are left out.
MAX_DIFF_TOKENS = 30_000
# Diffs shorter than MAX_DIFF_TOKENS * this many chars are assumed to fit (no count_tokens
# call). Claude averages well over 2 chars/token on code, so this errs on the safe side.
SAFE_CHARS_PER_TOKEN = 2
