from typing import Literal

from pydantic import BaseModel

from app.schemas.sorting_judge import SortingJudgeResult

Distribution = Literal["random", "reverse", "sorted", "duplicates"]
MeasurementStatus = Literal["completed", "time_limit", "runtime_error", "incorrect", "invalidated", "unavailable", "not_run"]
MeasurementError = Literal[
    "case_time_limit", "request_time_limit", "larger_case_skipped", "wrong_output", "invalid_return",
    "python_exception", "memory_limit_exceeded", "invalid_output", "judge_unavailable", "correctness_required",
    "request_stopped", "later_case_incorrect",
]


class SortingMeasurement(BaseModel):
    size: int
    distribution: Distribution
    seed: int
    successful_runs: int = 0
    requested_runs: int
    median_ms: float | None = None
    min_ms: float | None = None
    max_ms: float | None = None
    judge0_cpu_ms: float | None = None
    status: MeasurementStatus = "not_run"
    error_message: MeasurementError | None = None


class SortingBenchmarkResult(BaseModel):
    algorithm_status: Literal["completed", "partial", "incorrect", "unavailable", "time_limit"]
    correctness_passed: bool
    correctness: SortingJudgeResult
    python_version: str | None
    judge0_language_id: int
    measurements: list[SortingMeasurement]
