"""FastAPI router: /health, /questions, /evaluate (contract: CLAUDE.md section 4).

Endpoints are plain `def`: the anthropic client is synchronous, so FastAPI runs them in its
threadpool. /evaluate makes no Claude call: answers are multiple choice and the correct
option is stored in the session. Claude/SDK errors are turned into Turkish 502/503 responses by
install_error_handlers(), which main.py calls on the app.
"""
import logging

import anthropic
from fastapi import APIRouter, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from . import ai, config, diffs, session
from .schemas import (AnswerResult, EvaluateRequest, EvaluateResponse, OptionResult,
                      PublicOption, PublicQuestion, Question, QuestionsRequest,
                      QuestionsResponse)

log = logging.getLogger(__name__)

router = APIRouter()


@router.get("/health")
def health() -> dict:
    return {"ok": True}


@router.post("/questions", response_model=QuestionsResponse)
def questions(req: QuestionsRequest) -> QuestionsResponse:
    fitted = diffs.fit(req.diff, req.context)
    context = req.context
    if fitted.omitted_files:  # readme_diff is low priority too; don't let it re-inflate the prompt
        context = context.model_copy(update={"readme_diff": None})
    qs = ai.soru_uret(fitted.diff, context, req.params, fitted.omitted_files)
    qs = _unique_ids(qs)
    s = session.create(qs)
    log.info("session %s: %d questions", s.id, len(qs))
    return QuestionsResponse(
        session_id=s.id,
        questions=[_public(q) for q in qs],
        omitted_files=fitted.omitted_files,
    )


def _public(q: Question) -> PublicQuestion:
    """Hide correct_option and explanations until the user has answered."""
    return PublicQuestion(id=q.id, question=q.question, file=q.file, line_hint=q.line_hint,
                          topic=q.topic,
                          options=[PublicOption(id=o.id, text=o.text) for o in q.options])


@router.post("/evaluate", response_model=EvaluateResponse)
def evaluate(req: EvaluateRequest) -> EvaluateResponse:
    s = session.get(req.session_id)
    if s is None:
        raise HTTPException(404, "Oturum bulunamadı ya da süresi doldu; soruları yeniden isteyin.")

    chosen: dict[str, str | None] = {}
    for a in req.answers:
        q = s.question(a.question_id)
        if q is None:
            raise HTTPException(422, f"Bilinmeyen soru: {a.question_id}")
        if a.option_id is not None and a.option_id not in {o.id for o in q.options}:
            raise HTTPException(422, f"Bilinmeyen şık: {a.question_id} / {a.option_id}")
        chosen[a.question_id] = a.option_id

    results = [_grade(q, chosen.get(q.id)) for q in s.questions]
    passed, score = _verdict(results)
    log.info("session %s: passed=%s score=%.2f", s.id, passed, score)
    return EvaluateResponse(passed=passed, score=score, results=results)


def _grade(q: Question, option_id: str | None) -> AnswerResult:
    """Unanswered (None) counts as wrong. Every option comes back with its explanation."""
    return AnswerResult(
        question_id=q.id,
        chosen_option=option_id,
        correct_option=q.correct_option,
        correct=option_id == q.correct_option,
        options=[OptionResult(id=o.id, text=o.text, is_correct=o.id == q.correct_option,
                              explanation=o.explanation) for o in q.options],
    )


def _verdict(results: list[AnswerResult]) -> tuple[bool, float]:
    """Trivial diff (no questions) passes with score 1.0."""
    if not results:
        return True, 1.0
    score = round(sum(r.correct for r in results) / len(results), 3)
    return score >= config.PASS_RATIO, score


def _unique_ids(qs: list[Question]) -> list[Question]:
    """The model picks ids; renumber if they collide or are empty, so answers map 1:1."""
    ids = [q.id for q in qs]
    if all(ids) and len(set(ids)) == len(ids):
        return qs
    return [q.model_copy(update={"id": f"q{i}"}) for i, q in enumerate(qs, 1)]


# --- Error mapping -------------------------------------------------------------

def _error(status: int, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"detail": message})


def install_error_handlers(app: FastAPI) -> None:
    # Starlette picks the handler for the most specific class in the MRO, so
    # RateLimitError wins over its parent APIStatusError.
    @app.exception_handler(anthropic.RateLimitError)
    def _rate_limited(_: Request, exc: anthropic.RateLimitError):
        log.warning("Claude rate limit: %s", exc)
        return _error(503, "Claude şu an yoğun (istek sınırı). Biraz bekleyip tekrar deneyin.")

    @app.exception_handler(anthropic.APIStatusError)
    def _status(_: Request, exc: anthropic.APIStatusError):
        log.error("Claude API error %s: %s", exc.status_code, exc)
        return _error(502, f"Claude API hata döndü ({exc.status_code}).")

    @app.exception_handler(anthropic.APIConnectionError)
    def _connection(_: Request, exc: anthropic.APIConnectionError):
        log.error("Claude connection error: %s", exc)
        return _error(503, "Claude API'ye bağlanılamadı. İnternet bağlantınızı kontrol edin.")

    @app.exception_handler(diffs.DiffTooLarge)
    def _too_large(_: Request, exc: diffs.DiffTooLarge):
        log.warning("Diff too large: %s", exc)
        return _error(413, "Diff çok büyük: tek bir dosya bile sınıra sığmıyor. "
                           "Değişikliği daha küçük commit'lere bölün.")

    @app.exception_handler(ai.AIError)
    def _ai(_: Request, exc: ai.AIError):
        log.error("Unusable Claude output: %s", exc)
        return _error(502, str(exc))
