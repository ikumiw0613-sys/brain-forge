import asyncio
import json
from random import Random

from app.schemas.judge0 import Judge0ExecutionResult
from app.schemas.sorting_judge import SortingCaseResult, SortingFailure, SortingJudgeResult
from app.services.judge0 import Judge0Client, Judge0Error

_MAX_JUDGE_SECONDS = 45
_MAX_OUTPUT_CHARACTERS = 4096
_MAX_SAFE_INTEGER = 2**53 - 1


def _fixed_cases() -> tuple[tuple[str, tuple[int, ...]], ...]:
    random = Random(42)
    values = tuple(random.randrange(256) for _ in range(16))
    return (
        ("random", values),
        ("reverse", tuple(sorted(values, reverse=True))),
        ("sorted", tuple(sorted(values))),
        ("duplicates", tuple(random.randrange(4) for _ in range(16))),
        ("all_equal", (7,) * 8),
        ("single", (3,)),
        ("empty", ()),
        ("negative_and_zero", (0, -3, 5, -1, 0, -3, 2)),
    )


_CASES = _fixed_cases()
_JUDGE_FAILURES = {SortingFailure.JUDGE_UNAVAILABLE, SortingFailure.JUDGE_TIMEOUT}
_STOP_REASONS = _JUDGE_FAILURES | {SortingFailure.TIME_LIMIT_EXCEEDED, SortingFailure.MEMORY_LIMIT_EXCEEDED}
_HARNESS_FAILURES = {
    reason.value: reason
    for reason in (SortingFailure.INVALID_RETURN, SortingFailure.PYTHON_EXCEPTION, SortingFailure.MEMORY_LIMIT_EXCEEDED)
}

# Judge0 runs this script. Its output and the user's code share a process and are untrusted.
_PYTHON_HARNESS = '''\
import json
import os
import sys
from contextlib import redirect_stderr, redirect_stdout


def run(source, parts):
    namespace = {"__name__": "sorting"}
    try:
        with open(os.devnull, "w") as discard, redirect_stdout(discard), redirect_stderr(discard):
            exec(compile(source, "sorting.py", "exec"), namespace)
            sort_parts = namespace.get("sort_parts")
            if not callable(sort_parts):
                return {"kind": "invalid_return"}
            output = sort_parts(list(parts))
            if type(output) is not list:
                return {"kind": "invalid_return"}
            # One extra value is enough for the server to detect an oversized result.
            values = output[:len(parts) + 1]
            if any(type(value) is not int or abs(value) > 2**53 - 1 for value in values):
                return {"kind": "invalid_return"}
            return {"kind": "result", "values": values}
    except MemoryError:
        return {"kind": "memory_limit_exceeded"}
    except BaseException:
        return {"kind": "python_exception"}


request = json.load(sys.stdin)
print(json.dumps(run(request["source_code"], request["parts"]), separators=(",", ":")))
'''


def _case_failure(execution: Judge0ExecutionResult, expected: list[int]) -> SortingFailure | None:
    if execution.status_id == 5:
        return SortingFailure.TIME_LIMIT_EXCEEDED
    if 6 <= execution.status_id <= 12:
        return SortingFailure.PYTHON_EXCEPTION
    if execution.status_id != 3:
        return SortingFailure.JUDGE_UNAVAILABLE

    if not execution.stdout or len(execution.stdout) > _MAX_OUTPUT_CHARACTERS:
        return SortingFailure.INVALID_OUTPUT
    try:
        output = json.loads(execution.stdout)
    except (ValueError, RecursionError):
        return SortingFailure.INVALID_OUTPUT
    if not isinstance(output, dict) or not isinstance(output.get("kind"), str):
        return SortingFailure.INVALID_OUTPUT
    if set(output) == {"kind"} and output["kind"] in _HARNESS_FAILURES:
        return _HARNESS_FAILURES[output["kind"]]
    if set(output) != {"kind", "values"} or output["kind"] != "result":
        return SortingFailure.INVALID_OUTPUT

    values = output["values"]
    if not isinstance(values, list) or any(type(value) is not int or abs(value) > _MAX_SAFE_INTEGER for value in values):
        return SortingFailure.INVALID_RETURN
    if len(values) != len(expected):
        return SortingFailure.WRONG_LENGTH
    if values == expected:
        return None
    if sorted(values) != expected:
        return SortingFailure.WRONG_ELEMENTS
    return SortingFailure.WRONG_ORDER


async def judge_sorting(client: Judge0Client, source_code: str) -> SortingJudgeResult:
    results: list[SortingCaseResult] = []
    async with client.reserve_python_execution() as run:
        try:
            async with asyncio.timeout(_MAX_JUDGE_SECONDS):
                for name, parts in _CASES:
                    stdin = json.dumps({"source_code": source_code, "parts": parts})
                    execution = await run(_PYTHON_HARNESS, stdin)
                    reason = _case_failure(execution, sorted(parts))
                    results.append(SortingCaseResult(name=name, passed=reason is None, reason=reason))
                    if reason in _STOP_REASONS:
                        break
        except (Judge0Error, TimeoutError) as error:
            name, _ = _CASES[len(results)]
            reason = (
                SortingFailure.JUDGE_TIMEOUT
                if isinstance(error, TimeoutError) or str(error) in {"judge0_request_timeout", "judge0_poll_timeout"}
                else SortingFailure.JUDGE_UNAVAILABLE
            )
            results.append(SortingCaseResult(name=name, passed=False, reason=reason))

    results.extend(
        SortingCaseResult(name=name, passed=False, reason=SortingFailure.NOT_RUN)
        for name, _ in _CASES[len(results):]
    )
    passed = sum(result.passed for result in results)
    status = "failed"
    if passed == len(_CASES):
        status = "passed"
    elif any(result.reason in _JUDGE_FAILURES for result in results):
        status = "unavailable"
    return SortingJudgeResult(status=status, passed_cases=passed, total_cases=len(_CASES), cases=results)
