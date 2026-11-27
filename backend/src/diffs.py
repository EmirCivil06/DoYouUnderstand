"""Large-diff handling (CLAUDE.md section 5): never cut silently.

If the diff is over MAX_DIFF_TOKENS, whole files are left out in reverse priority order:
new code > modified code > README/docs/config > deleted files. The caller reports the
left-out files to Claude (so it asks nothing about them) and to the extension.
"""
import logging
import re
from dataclasses import dataclass, field
from pathlib import PurePosixPath

from . import ai, config
from .schemas import DiffContext

log = logging.getLogger(__name__)

_HEADER = re.compile(r"^diff --git a/(.+?) b/(.+)$", re.MULTILINE)

_NON_CODE_EXT = {".md", ".rst", ".txt", ".json", ".yaml", ".yml", ".toml", ".ini", ".cfg",
                 ".env", ".lock", ".csv", ".svg", ".xml", ".html"}
_NON_CODE_NAMES = {"readme", "license", "changelog", "dockerfile", "makefile", ".gitignore",
                   "package-lock.json", "poetry.lock", "yarn.lock", "requirements.txt"}

# Lower = more important.
NEW_CODE, MODIFIED_CODE, NON_CODE, DELETED = range(4)


class DiffTooLarge(Exception):
    """Not even one file fits into MAX_DIFF_TOKENS."""


@dataclass
class FileDiff:
    path: str
    text: str
    priority: int


@dataclass
class FitResult:
    diff: str
    omitted_files: list[str] = field(default_factory=list)


def split_files(diff: str, context: DiffContext | None = None) -> list[FileDiff]:
    """Split `git diff` output into one chunk per file, in original order."""
    context = context or DiffContext()
    starts = [m.start() for m in _HEADER.finditer(diff)]
    if not starts:
        return [FileDiff(path="(diff)", text=diff, priority=MODIFIED_CODE)]

    files = []
    if diff[: starts[0]].strip():  # text before the first header (rare): keep it, top priority
        files.append(FileDiff(path="(önsöz)", text=diff[: starts[0]], priority=NEW_CODE))
    for start, end in zip(starts, starts[1:] + [len(diff)]):
        text = diff[start:end]
        m = _HEADER.match(text)
        head = text[:500]
        if "\ndeleted file mode" in head or m.group(1) in context.deleted_files:
            files.append(FileDiff(m.group(1), text, DELETED))
            continue
        path = m.group(2)
        new = "\nnew file mode" in head or path in context.added_files
        if _is_non_code(path):
            priority = NON_CODE
        else:
            priority = NEW_CODE if new else MODIFIED_CODE
        files.append(FileDiff(path, text, priority))
    return files


def _is_non_code(path: str) -> bool:
    p = PurePosixPath(path)
    name = p.name.lower()
    return (p.suffix.lower() in _NON_CODE_EXT or name in _NON_CODE_NAMES
            or p.stem.lower() in _NON_CODE_NAMES or "docs" in (s.lower() for s in p.parts[:-1]))


def fit(diff: str, context: DiffContext | None = None,
        limit: int | None = None) -> FitResult:
    """Return the diff unchanged if it fits, otherwise the highest-priority files that fit."""
    limit = limit or config.MAX_DIFF_TOKENS
    if len(diff) <= limit * config.SAFE_CHARS_PER_TOKEN:
        return FitResult(diff)  # obviously small: skip the count_tokens round trip

    total = ai.count_tokens(diff)
    if total <= limit:
        return FitResult(diff)

    files = split_files(diff, context)
    # Per-file estimate: share of the measured total by character length.
    per_char = total / max(len(diff), 1)
    order = sorted(range(len(files)), key=lambda i: (files[i].priority, i))

    kept: set[int] = set()
    used = 0.0
    for i in order:
        cost = len(files[i].text) * per_char
        if used + cost <= limit:
            kept.add(i)
            used += cost

    # The estimate is proportional; verify once and drop the least important file until it fits.
    while kept:
        trimmed = "".join(files[i].text for i in sorted(kept))
        tokens = ai.count_tokens(trimmed)
        if tokens <= limit:
            break
        kept.remove(max(kept, key=lambda i: (files[i].priority, i)))
    if not kept:
        raise DiffTooLarge(f"diff is {total} tokens; no single file fits into {limit}")

    omitted = [files[i].path for i in range(len(files)) if i not in kept]
    log.warning("diff %d tokens > %d: kept %d files (%d tokens), omitted %s",
                total, limit, len(kept), tokens, omitted)
    return FitResult(trimmed, omitted)
