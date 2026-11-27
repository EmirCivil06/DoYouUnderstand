"""Claude API layer: multiple-choice question generation.

Grading needs no Claude call (the correct option is known), see src/api.py.

anthropic.* errors (RateLimitError, APIStatusError, APIConnectionError) are not caught
here; the API layer maps them to 502/503. Unusable model output raises AIError.
"""
import logging
import random

import anthropic

from . import config, prompts
from .schemas import DiffContext, Option, Question, QuestionParams, QuestionSet

log = logging.getLogger(__name__)

_client: anthropic.Anthropic | None = None


class AIError(Exception):
    """Claude answered, but the output cannot be used (refusal, truncation, bad schema)."""


def get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        key = config.api_key()
        if not key:
            raise AIError("API anahtarı bulunamadı: backend/.env içine ANTHROPIC_API_KEY yazın.")
        _client = anthropic.Anthropic(api_key=key)
    return _client


def _system(text: str) -> list[dict]:
    return [{"type": "text", "text": text, "cache_control": {"type": "ephemeral"}}]


def _parsed(response, what: str):
    u = response.usage
    cost = (u.input_tokens * config.PRICE_IN + u.output_tokens * config.PRICE_OUT) / 1_000_000
    log.info("%s: in=%d out=%d ~$%.5f stop=%s model=%s",
             what, u.input_tokens, u.output_tokens, cost, response.stop_reason, response.model)

    if response.stop_reason == "refusal":
        raise AIError(f"Claude isteği reddetti: {getattr(response, 'stop_details', None)}")
    if response.stop_reason == "max_tokens":
        raise AIError("Claude yanıtı max_tokens sınırında kesildi.")
    if response.parsed_output is None:
        raise AIError("Claude yanıtı beklenen şemaya uymadı.")
    return response.parsed_output


def soru_uret(diff: str, context: DiffContext | None = None,
              params: QuestionParams | None = None,
              omitted_files: list[str] | None = None) -> list[Question]:
    """Generate NUM_QUESTIONS multiple-choice questions. Empty list = trivial diff, allow commit."""
    context = context or DiffContext()
    params = params or QuestionParams()
    n = config.NUM_QUESTIONS
    response = get_client().messages.parse(
        model=config.MODEL,
        max_tokens=config.QUESTION_MAX_TOKENS,
        output_config={"effort": config.QUESTION_EFFORT},
        system=_system(prompts.QUESTION_SYSTEM),
        messages=[{"role": "user",
                   "content": prompts.question_message(diff, context, params, n, omitted_files)}],
        output_format=QuestionSet,
    )
    raw = _parsed(response, "soru_uret").questions
    questions = [q for q in map(_normalize, raw) if q is not None]
    if raw and not questions:
        raise AIError("Claude geçerli bir çoktan seçmeli soru üretemedi.")
    if len(questions) > n:
        log.info("soru_uret: got %d valid questions, keeping %d", len(questions), n)
    return questions[:n]


def _normalize(q: Question) -> Question | None:
    """Check the one-correct-of-four shape, shuffle options and relabel them a-d.

    Structured output can't enforce "exactly one correct", so a malformed question is
    dropped (and logged) instead of failing the whole set. Shuffling matters: models tend
    to put the correct answer in the same slot.
    """
    ids = [o.id for o in q.options]
    if (len(q.options) != config.NUM_OPTIONS or len(set(ids)) != len(ids)
            or q.correct_option not in ids):
        log.warning("soru_uret: dropping malformed question %r (options=%s correct=%r)",
                    q.id, ids, q.correct_option)
        return None
    options = list(q.options)
    random.shuffle(options)
    relabeled = [Option(id=new, text=o.text, explanation=o.explanation)
                 for new, o in zip(config.OPTION_IDS, options)]
    correct = next(new for new, o in zip(config.OPTION_IDS, options) if o.id == q.correct_option)
    return q.model_copy(update={"options": relabeled, "correct_option": correct})


def count_tokens(text: str) -> int:
    """Token count of `text` as a user message (count_tokens endpoint, no generation cost)."""
    return get_client().messages.count_tokens(
        model=config.MODEL,
        messages=[{"role": "user", "content": text}],
    ).input_tokens
