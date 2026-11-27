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
    # The question count is fixed (config.NUM_QUESTIONS); it is not a request parameter.
    difficulty: Literal["kolay", "orta", "zor"] = "orta"
    language: str = "tr"
    focus_topics: list[str] = []


# --- Claude structured outputs -------------------------------------------------

class Option(BaseModel):
    id: str = Field(description="Option label: a, b, c or d")
    text: str
    explanation: str = Field(
        description="Why this option is correct (for the correct one) or why it is wrong")


class Question(BaseModel):
    id: str
    question: str
    file: str
    line_hint: int | None = None
    topic: str
    options: list[Option] = Field(description="Exactly 4 options, exactly one of them correct")
    correct_option: str = Field(description="id of the single correct option")


class QuestionSet(BaseModel):
    questions: list[Question]


# --- HTTP request/response bodies (CLAUDE.md section 4) ------------------------

class QuestionsRequest(BaseModel):
    diff: str = Field(min_length=1)
    context: DiffContext = DiffContext()
    params: QuestionParams = QuestionParams()


class PublicOption(BaseModel):
    """Option as shown before answering: no explanation, no hint which one is correct."""
    id: str
    text: str


class PublicQuestion(BaseModel):
    """Question as sent to the extension: correct_option and explanations stay in the session."""
    id: str
    question: str
    file: str
    line_hint: int | None = None
    topic: str
    options: list[PublicOption]


class QuestionsResponse(BaseModel):
    session_id: str
    questions: list[PublicQuestion]
    omitted_files: list[str] = Field(
        [], description="Files left out because the diff was too large (no questions about them)")


class AnswerIn(BaseModel):
    question_id: str
    option_id: str | None = None  # None / missing = unanswered


class EvaluateRequest(BaseModel):
    session_id: str
    answers: list[AnswerIn]


class OptionResult(BaseModel):
    id: str
    text: str
    is_correct: bool
    explanation: str


class AnswerResult(BaseModel):
    question_id: str
    chosen_option: str | None
    correct_option: str
    correct: bool
    options: list[OptionResult]  # every option with why it is right / wrong


class EvaluateResponse(BaseModel):
    passed: bool
    score: float  # fraction of questions answered correctly
    results: list[AnswerResult]
