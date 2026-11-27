"""Large-diff trimming with count_tokens mocked (1 token per char)."""
import pytest

from src import ai, config, diffs
from src.schemas import DiffContext


def _file(path, body, mode=""):
    m = f"{mode} file mode 100644\n" if mode else ""
    return f"diff --git a/{path} b/{path}\n{m}--- a/{path}\n+++ b/{path}\n@@ -0,0 +1 @@\n{body}\n"


@pytest.fixture(autouse=True)
def chars_as_tokens(monkeypatch):
    monkeypatch.setattr(config, "SAFE_CHARS_PER_TOKEN", 1)
    calls = []
    monkeypatch.setattr(ai, "count_tokens", lambda t: calls.append(t) or len(t))
    return calls


def test_small_diff_skips_count(chars_as_tokens):
    d = _file("a.py", "+x")
    assert len(d) < 1000
    assert diffs.fit(d, limit=1000).diff == d
    assert chars_as_tokens == []


def test_priority_order():
    d = (_file("README.md", "+" + "r" * 300) + _file("old.py", "-" + "o" * 300, "deleted")
         + _file("mod.py", "+" + "m" * 300) + _file("new.py", "+" + "n" * 300, "new"))
    kinds = {f.path: f.priority for f in diffs.split_files(d)}
    assert kinds == {"README.md": diffs.NON_CODE, "old.py": diffs.DELETED,
                     "mod.py": diffs.MODIFIED_CODE, "new.py": diffs.NEW_CODE}

    r = diffs.fit(d, limit=800)  # room for two files
    assert r.omitted_files == ["README.md", "old.py"]
    assert "n" * 300 in r.diff and "m" * 300 in r.diff
    assert r.diff.index("mod.py") < r.diff.index("new.py")  # original order kept


def test_context_marks_added_file():
    d = _file("x.py", "+1")
    assert diffs.split_files(d, DiffContext(added_files=["x.py"]))[0].priority == diffs.NEW_CODE


def test_nothing_fits_raises():
    with pytest.raises(diffs.DiffTooLarge):
        diffs.fit(_file("a.py", "+" + "a" * 500), limit=100)
