"""ai.soru_uret post-processing, with the Claude client mocked out."""
from types import SimpleNamespace

import pytest

from src import ai
from src.schemas import Option, Question, QuestionSet


def _q(qid, ids="abcd", correct="b"):
    return Question(id=qid, question="?", file="a.py", topic="t", correct_option=correct,
                    options=[Option(id=i, text=f"metin {i}", explanation=f"neden {i}") for i in ids])


def _mock_claude(monkeypatch, questions):
    response = SimpleNamespace(
        usage=SimpleNamespace(input_tokens=1, output_tokens=1), stop_reason="end_turn",
        model="m", parsed_output=QuestionSet(questions=questions))
    client = SimpleNamespace(messages=SimpleNamespace(parse=lambda **kw: response))
    monkeypatch.setattr(ai, "get_client", lambda: client)


def test_shuffle_keeps_correct_option_and_explanations(monkeypatch):
    _mock_claude(monkeypatch, [_q("q1")])
    for _ in range(20):
        (q,) = ai.soru_uret("+x")
        assert [o.id for o in q.options] == list("abcd")
        correct = next(o for o in q.options if o.id == q.correct_option)
        assert correct.text == "metin b" and correct.explanation == "neden b"


def test_malformed_questions_dropped_and_capped(monkeypatch):
    _mock_claude(monkeypatch, [
        _q("bad1", ids="abc"),            # 3 options
        _q("bad2", correct="z"),          # correct option not among options
        _q("bad3", ids="aabc"),           # duplicate ids
        _q("q1"), _q("q2"), _q("q3"), _q("q4"),
    ])
    assert [q.id for q in ai.soru_uret("+x")] == ["q1", "q2", "q3"]


def test_all_malformed_raises(monkeypatch):
    _mock_claude(monkeypatch, [_q("bad", correct="z")])
    with pytest.raises(ai.AIError):
        ai.soru_uret("+x")


def test_trivial_diff_returns_empty(monkeypatch):
    _mock_claude(monkeypatch, [])
    assert ai.soru_uret("+x") == []
