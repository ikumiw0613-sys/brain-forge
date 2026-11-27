import asyncio
import json
import re
from random import Random
from statistics import median
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.judge0 import Judge0ExecutionResult
from app.schemas.sorting_benchmark import Distribution, SortingBenchmarkResult, SortingMeasurement
from app.services.judge0 import Judge0Client, Judge0Error
from app.services.sorting_judge import judge_sorting_cases

_SIZES = (100, 1_000, 10_000)
_DISTRIBUTIONS: tuple[Distribution, ...] = ("random", "reverse", "sorted", "duplicates")
_SEED = 42
_RUNS = 5
_MAX_MEASUREMENT_SECONDS = 65
_UPSTREAM_TIMEOUTS = {"judge0_poll_timeout", "judge0_request_timeout"}

# This harness runs alongside the submitted code. Its timings and output are untrusted.
_HARNESS = '''\
import json
import os
import platform
import sys
from contextlib import redirect_stderr, redirect_stdout
from time import perf_counter


def measure(request, clock=perf_counter):
    parts = request["parts"]
    expected = sorted(parts)
    namespace = {"__name__": "sorting"}
    samples = []
    try:
        with open(os.devnull, "w") as discard, redirect_stdout(discard), redirect_stderr(discard):
            exec(compile(request["source_code"], "sorting.py", "exec"), namespace)
            sort_parts = namespace.get("sort_parts")
            if not callable(sort_parts):
                return "invalid_return", samples
            deadline = clock() + 1.25
            for _ in range(request["runs"]):
                values = list(parts)
                start = clock()
                if start >= deadline:
                    return "case_time_limit", samples
                output = sort_parts(values)
                end = clock()
                if type(output) is not list or any(type(value) is not int for value in output):
                    return "invalid_return", samples
                if output != expected:
                    return "wrong_output", samples
                if end > deadline:
                    return "case_time_limit", samples
                samples.append((end - start) * 1000)
    except MemoryError:
        return "memory_limit_exceeded", samples
    except BaseException:
        return "python_exception", samples
    return "completed", samples


python_version = platform.python_version()
request = json.load(sys.stdin)
outcome, samples = measure(request)
print(json.dumps({"python_version": python_version, "outcome": outcome, "samples": samples}, allow_nan=False))
'''


class _Report(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    python_version: str = Field(pattern=r"^\d{1,2}\.\d{1,2}\.\d{1,3}$")
    outcome: Literal[
        "completed", "case_time_limit", "wrong_output", "invalid_return", "python_exception", "memory_limit_exceeded"
    ]
    samples: list[Annotated[float, Field(ge=0, le=1250, allow_inf_nan=False)]] = Field(max_length=_RUNS)


def benchmark_input(size: int, distribution: Distribution) -> list[int]:
    random = Random(_SEED)
    # Use Random.random's stable sequence. The three orderings share the same multiset.
    spread = 8 if distribution == "duplicates" else 1_000_000
    parts = [int(random.random() * spread) for _ in range(size)]
    if distribution in {"sorted", "reverse"}:
        parts.sort(reverse=distribution == "reverse")
    return parts


def _record(execution: Judge0ExecutionResult, case: SortingMeasurement) -> str | None:
    if execution.execution_time is not None:
        case.judge0_cpu_ms = execution.execution_time * 1000
    if execution.status_id == 5:
        case.status, case.error_message = "time_limit", "case_time_limit"
    elif 6 <= execution.status_id <= 12:
        case.status, case.error_message = "runtime_error", "python_exception"
    elif execution.status_id != 3:
        case.status, case.error_message = "unavailable", "judge_unavailable"
    else:
        try:
            stdout = execution.stdout
            if not stdout or len(stdout) > 2048:
                raise ValueError
            report = _Report.model_validate_json(stdout)
            if (report.outcome == "completed") != (len(report.samples) == _RUNS):
                raise ValueError
        except ValueError:
            case.status, case.error_message = "unavailable", "invalid_output"
            return None

        case.successful_runs = len(report.samples)
        if report.outcome == "completed":
            case.status = "completed"
            case.error_message = None
            case.median_ms = median(report.samples)
            case.min_ms = min(report.samples)
            case.max_ms = max(report.samples)
        else:
            case.error_message = report.outcome
            if report.outcome == "case_time_limit":
                case.status = "time_limit"
            elif report.outcome in {"wrong_output", "invalid_return"}:
                case.status = "incorrect"
            else:
                case.status = "runtime_error"
        return report.python_version
    return None


async def benchmark_sorting(client: Judge0Client, source_code: str) -> SortingBenchmarkResult:
    async with client.reserve_python_execution() as run:
        correctness = await judge_sorting_cases(run, source_code)
        cases = [
            SortingMeasurement(size=size, distribution=distribution, seed=_SEED, requested_runs=_RUNS)
            for size in _SIZES for distribution in _DISTRIBUTIONS
        ]
        result = SortingBenchmarkResult(
            algorithm_status="incorrect", correctness_passed=correctness.status == "passed", correctness=correctness,
            python_version=None, judge0_language_id=client.python_language_id, measurements=cases,
        )
        if not result.correctness_passed:
            for case in cases:
                case.error_message = "correctness_required"
            if correctness.status == "unavailable":
                result.algorithm_status = "unavailable"
            elif any(case.reason == "time_limit_exceeded" for case in correctness.cases):
                result.algorithm_status = "time_limit"
            return result

        slow: set[Distribution] = set()
        for case in cases:
            case.error_message = "request_stopped"
        try:
            async with asyncio.timeout(_MAX_MEASUREMENT_SECONDS):
                for case in cases:
                    if case.distribution in slow:
                        case.error_message = "larger_case_skipped"
                        continue
                    stdin = json.dumps({
                        "source_code": source_code, "parts": benchmark_input(case.size, case.distribution), "runs": _RUNS,
                    }, separators=(",", ":"))
                    execution = await run(_HARNESS, stdin)
                    version = _record(execution, case)
                    if result.python_version is None:
                        result.python_version = version
                    elif version is not None and version != result.python_version:
                        case.status, case.error_message = "unavailable", "invalid_output"
                        case.median_ms = case.min_ms = case.max_ms = None
                    if case.status in {"incorrect", "unavailable"}:
                        break
                    if case.status == "time_limit":
                        slow.add(case.distribution)
        except (Judge0Error, TimeoutError) as error:
            if isinstance(error, TimeoutError) or str(error) in _UPSTREAM_TIMEOUTS:
                case.status, case.error_message = "time_limit", "request_time_limit"
            else:
                case.status, case.error_message = "unavailable", "judge_unavailable"

        if any(case.status == "incorrect" for case in cases):
            result.algorithm_status = "incorrect"
            for case in cases:
                if case.status == "completed":
                    case.status, case.error_message = "invalidated", "later_case_incorrect"
                    case.median_ms = case.min_ms = case.max_ms = None
        elif any(case.status == "unavailable" for case in cases):
            result.algorithm_status = "unavailable"
        elif all(case.status == "completed" for case in cases):
            result.algorithm_status = "completed"
        elif any(case.status == "time_limit" for case in cases):
            result.algorithm_status = "time_limit"
        else:
            result.algorithm_status = "partial"
        return result
