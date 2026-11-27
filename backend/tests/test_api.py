"""API tests with Claude mocked out (no real API calls)."""
import pytest
from fastapi.testclient import TestClient

import main
from src import ai, diffs, session
from src.schemas import Option, Question

client = TestClient(main.app)


def _q(qid: str, correct: str) -> Question:
    return Question(
        id=qid, question=f"{qid}?", file="a.py", topic="uç durumlar",
        options=[Option(id=i, text=f"şık {i}", explanation=f"{i} açıklaması") for i in "abcde"],
        correct_option=correct)


QS = [_q("q1", "a"), _q("q2", "c"), _q("q3", "d")]


@pytest.fixture(autouse=True)
def _reset():
    session.clear()


@pytest.fixture
def mock_ai(monkeypatch):
    monkeypatch.setattr(ai, "soru_uret", lambda diff, ctx, params, omitted=None: QS)


def _ask():
    r = client.post("/questions", json={"diff": "+x = 1"})
    assert r.status_code == 200
    return r.json()


def _evaluate(sid, choices):
    return client.post("/evaluate", json={"session_id": sid, "answers": [
        {"question_id": q, "option_id": o} for q, o in choices.items()]})


def test_health():
    assert client.get("/health").json() == {"ok": True}


def test_questions_hide_answers(mock_ai):
    body = _ask()
    assert [q["id"] for q in body["questions"]] == ["q1", "q2", "q3"]
    for q in body["questions"]:
        assert "correct_option" not in q
        assert q["options"] == [{"id": i, "text": f"şık {i}"} for i in "abcde"]


def test_evaluate_all_correct(mock_ai):
    sid = _ask()["session_id"]
    body = _evaluate(sid, {"q1": "a", "q2": "c", "q3": "d"}).json()
    assert body["passed"] is True and body["score"] == 1.0
    r = body["results"][0]
    assert r["chosen_option"] == "a" and r["correct_option"] == "a" and r["correct"] is True
    assert [o["is_correct"] for o in r["options"]] == [True, False, False, False, False]
    assert all(o["explanation"] for o in r["options"])


def test_two_of_three_passes_one_fails(mock_ai):
    sid = _ask()["session_id"]
    body = _evaluate(sid, {"q1": "a", "q2": "c", "q3": "a"}).json()
    assert body["passed"] is True and body["score"] == 0.667
    assert body["results"][2]["correct"] is False
    assert body["results"][2]["correct_option"] == "d"
    body = _evaluate(sid, {"q1": "a", "q2": "a", "q3": "a"}).json()
    assert body["passed"] is False and body["score"] == 0.333


def test_unanswered_question_is_wrong(mock_ai):
    sid = _ask()["session_id"]
    body = _evaluate(sid, {"q1": "a", "q2": None}).json()
    assert [r["correct"] for r in body["results"]] == [True, False, False]
    assert body["results"][1]["chosen_option"] is None
    assert body["results"][2]["options"][3]["explanation"] == "d açıklaması"


def test_unknown_session_question_and_option(mock_ai):
    assert client.post("/evaluate", json={"session_id": "x", "answers": []}).status_code == 404
    sid = _ask()["session_id"]
    assert _evaluate(sid, {"q9": "a"}).status_code == 422
    assert _evaluate(sid, {"q1": "z"}).status_code == 422


def test_evaluate_single_answer(mock_ai):
    """The extension grades each question as soon as it is answered (one answer per call)."""
    sid = _ask()["session_id"]
    for qid, opt in (("q1", "a"), ("q2", "b"), ("q3", "d")):
        r = _evaluate(sid, {qid: opt})
        assert r.status_code == 200
        res = next(x for x in r.json()["results"] if x["question_id"] == qid)
        assert res["chosen_option"] == opt
    assert session.get(sid) is not None  # session survives repeated /evaluate calls


def test_num_questions_passed_and_validated(monkeypatch):
    seen = {}
    monkeypatch.setattr(ai, "soru_uret",
                        lambda diff, ctx, params, omitted=None: seen.update(n=params.num_questions) or QS)
    assert client.post("/questions", json={"diff": "+x", "params": {"num_questions": 5}}).status_code == 200
    assert seen["n"] == 5
    for bad in (0, 6):
        assert client.post("/questions", json={"diff": "+x", "params": {"num_questions": bad}}).status_code == 422


def test_trivial_diff_passes(monkeypatch):
    monkeypatch.setattr(ai, "soru_uret", lambda *a: [])
    sid = _ask()["session_id"]
    body = client.post("/evaluate", json={"session_id": sid, "answers": []}).json()
    assert body == {"passed": True, "score": 1.0, "results": []}


def test_ai_error_maps_to_502(monkeypatch):
    def boom(*a):
        raise ai.AIError("Claude isteği reddetti")
    monkeypatch.setattr(ai, "soru_uret", boom)
    r = client.post("/questions", json={"diff": "+x"})
    assert r.status_code == 502 and "reddetti" in r.json()["detail"]


def test_large_diff_reports_omitted_files(monkeypatch):
    seen = {}
    monkeypatch.setattr(diffs, "fit", lambda d, c: diffs.FitResult("+kısa", ["README.md"]))
    monkeypatch.setattr(ai, "soru_uret",
                        lambda diff, ctx, params, omitted: seen.update(diff=diff, omitted=omitted) or QS)
    body = client.post("/questions", json={"diff": "+x"}).json()
    assert body["omitted_files"] == ["README.md"]
    assert seen == {"diff": "+kısa", "omitted": ["README.md"]}
