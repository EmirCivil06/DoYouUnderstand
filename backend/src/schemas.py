"""Pydantic models: request inputs (see CLAUDE.md section 4) and Claude output schemas."""
from typing import Literal

from pydantic import BaseModel, Field


# --- Inputs from the extension -------------------------------------------------

class DiffContext(BaseModel):
    repo_name: str | None = None
    branch: str | None = None
    commit_message: str | None = None
    added_files: list[str] = []
    modified_files: list[str] = []
    deleted_files: list[str] = []
    readme_diff: str | None = None
    languages: list[str] = []


class QuestionParams(BaseModel):
    num_questions: int = Field(3, ge=1, le=5)
    difficulty: Literal["kolay", "orta", "zor"] = "orta"
    language: str = "tr"
    focus_topics: list[str] = []


# --- Claude structured outputs -------------------------------------------------

class Question(BaseModel):
    id: str
    question: str
    file: str
    line_hint: int | None = None
    topic: str
    expected_points: list[str] = Field(description="Points a correct answer must contain")


class QuestionSet(BaseModel):
    questions: list[Question]


class Grade(BaseModel):
    correct: bool
    score: float = Field(description="0.0 - 1.0")
    feedback: str
    explanation: str | None = Field(None, description="Beginner-level explanation if the answer is wrong")
