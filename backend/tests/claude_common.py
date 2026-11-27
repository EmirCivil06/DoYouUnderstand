"""Shared helpers for the manual (real API) scripts in tests/. Not collected by pytest."""
import logging
import sys
from pathlib import Path

TESTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(TESTS_DIR.parent))  # make `src` importable

import anthropic  # noqa: E402

from src.ai import AIError  # noqa: E402

logging.basicConfig(level=logging.WARNING, format="[%(name)s] %(message)s")
logging.getLogger("src").setLevel(logging.INFO)  # show our usage/cost lines only

SAMPLE_DIFF = (TESTS_DIR / "fixtures" / "sepet.diff").read_text(encoding="utf-8")


def run_guarded(fn) -> None:
    """Run fn(), turning API/model errors into a short message and exit code 1."""
    try:
        fn()
    except AIError as e:
        sys.exit(f"FAIL: {e}")
    except anthropic.AuthenticationError:
        sys.exit("FAIL: invalid API key")
    except anthropic.RateLimitError:
        sys.exit("FAIL: rate limited")
    except anthropic.APIStatusError as e:
        sys.exit(f"FAIL: API error {e.status_code}: {e.message}")
    except anthropic.APIConnectionError:
        sys.exit("FAIL: network error")
