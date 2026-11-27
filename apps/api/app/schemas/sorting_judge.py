from enum import StrEnum
from typing import Literal

from pydantic import BaseModel


class SortingFailure(StrEnum):
    WRONG_LENGTH = "wrong_length"
    WRONG_ELEMENTS = "wrong_elements"
    WRONG_ORDER = "wrong_order"
    INVALID_RETURN = "invalid_return"
    INVALID_OUTPUT = "invalid_output"
    PYTHON_EXCEPTION = "python_exception"
    TIME_LIMIT_EXCEEDED = "time_limit_exceeded"
    MEMORY_LIMIT_EXCEEDED = "memory_limit_exceeded"
    JUDGE_UNAVAILABLE = "judge_unavailable"
    JUDGE_TIMEOUT = "judge_timeout"
    NOT_RUN = "not_run"


class SortingCaseResult(BaseModel):
    name: str
    passed: bool
    reason: SortingFailure | None


class SortingJudgeResult(BaseModel):
    status: Literal["passed", "failed", "unavailable"]
    passed_cases: int
    total_cases: int
    cases: list[SortingCaseResult]
