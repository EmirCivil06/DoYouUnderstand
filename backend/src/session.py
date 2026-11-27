"""In-memory session store: session_id -> questions (with correct options + explanations).

Nothing is persisted (CLAUDE.md section 10). Sessions expire after SESSION_TTL_SECONDS and
the oldest are dropped past SESSION_MAX_COUNT. Sync FastAPI endpoints run in a threadpool,
so every access goes through a lock.
"""
import threading
import time
import uuid
from dataclasses import dataclass, field

from . import config
from .schemas import Question


@dataclass
class Session:
    id: str
    questions: list[Question]
    created_at: float = field(default_factory=time.monotonic)

    def question(self, question_id: str) -> Question | None:
        return next((q for q in self.questions if q.id == question_id), None)

    def expired(self, now: float) -> bool:
        return now - self.created_at > config.SESSION_TTL_SECONDS


_sessions: dict[str, Session] = {}  # insertion order == creation order
_lock = threading.Lock()


def _prune(now: float) -> None:
    for sid in [sid for sid, s in _sessions.items() if s.expired(now)]:
        del _sessions[sid]
    while len(_sessions) > config.SESSION_MAX_COUNT:
        del _sessions[next(iter(_sessions))]


def create(questions: list[Question]) -> Session:
    session = Session(id=str(uuid.uuid4()), questions=questions)
    with _lock:
        _sessions[session.id] = session
        _prune(time.monotonic())
    return session


def get(session_id: str) -> Session | None:
    """Return the live session, or None if it never existed or has expired."""
    with _lock:
        session = _sessions.get(session_id)
        if session is not None and session.expired(time.monotonic()):
            del _sessions[session_id]
            return None
        return session


def delete(session_id: str) -> None:
    with _lock:
        _sessions.pop(session_id, None)


def clear() -> None:
    """Tests only."""
    with _lock:
        _sessions.clear()
