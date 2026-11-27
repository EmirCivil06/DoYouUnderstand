"""Claude API layer: question generation and answer grading.

anthropic.* errors (RateLimitError, APIStatusError, APIConnectionError) are not caught
here; the API layer maps them to 502/503. Unusable model output raises AIError.
"""
import logging

import anthropic

from . import config, prompts
from .schemas import DiffContext, Grade, Question, QuestionParams, QuestionSet

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
              params: QuestionParams | None = None) -> list[Question]:
    """Generate open-ended questions for a diff. Empty list = trivial diff, allow commit."""
    context = context or DiffContext()
    params = params or QuestionParams()
    response = get_client().messages.parse(
        model=config.MODEL,
        max_tokens=config.QUESTION_MAX_TOKENS,
        output_config={"effort": config.QUESTION_EFFORT},
        system=_system(prompts.QUESTION_SYSTEM),
        messages=[{"role": "user", "content": prompts.question_message(diff, context, params)}],
        output_format=QuestionSet,
    )
    questions = _parsed(response, "soru_uret").questions
    if len(questions) > params.num_questions:
        log.info("soru_uret: got %d questions, keeping %d", len(questions), params.num_questions)
    return questions[: params.num_questions]


def cevap_degerlendir(diff: str, question: Question, answer: str) -> Grade:
    """Grade one answer against the question's expected_points."""
    response = get_client().messages.parse(
        model=config.MODEL,
        max_tokens=config.EVAL_MAX_TOKENS,
        output_config={"effort": config.EVAL_EFFORT},
        system=_system(prompts.EVAL_SYSTEM),
        messages=[{"role": "user", "content": prompts.eval_message(diff, question, answer)}],
        output_format=Grade,
    )
    return _parsed(response, "cevap_degerlendir")
