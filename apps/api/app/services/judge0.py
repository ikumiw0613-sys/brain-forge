import asyncio
import re
from base64 import b64decode, b64encode
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from typing import Annotated
from uuid import UUID

import httpx2
from pydantic import BaseModel, Field, StrictStr, TypeAdapter, ValidationError

from app.schemas.judge0 import Judge0ExecutionResult, Judge0HealthResponse, Judge0Language

_POLL_INTERVAL_SECONDS = 0.5
_MAX_RESPONSE_BYTES = 512 * 1024
_STATUS_DESCRIPTIONS = {
    1: "In Queue",
    2: "Processing",
    3: "Accepted",
    4: "Wrong Answer",
    5: "Time Limit Exceeded",
    6: "Compilation Error",
    7: "Runtime Error (SIGSEGV)",
    8: "Runtime Error (SIGXFSZ)",
    9: "Runtime Error (SIGFPE)",
    10: "Runtime Error (SIGABRT)",
    11: "Runtime Error (NZEC)",
    12: "Runtime Error (Other)",
    13: "Internal Error",
    14: "Exec Format Error",
}
_PENDING_STATUS_IDS = {1, 2}
_INTERNAL_ERROR_STATUS_ID = 13
_LANGUAGES = TypeAdapter(list[Judge0Language])
RunPython = Callable[[str, str | None], Awaitable[Judge0ExecutionResult]]


class Judge0Error(Exception):
    pass


class _SubmissionToken(BaseModel):
    token: UUID


class _Submission(BaseModel):
    status_id: int = Field(strict=True)
    stdout: StrictStr | None = None
    stderr: StrictStr | None = None
    compile_output: StrictStr | None = None
    message: StrictStr | None = None
    time: Annotated[float, Field(ge=0, allow_inf_nan=False)] | None = None
    memory: Annotated[int, Field(ge=0, strict=True)] | None = None


def _decode_output(value: str | None) -> str | None:
    if value is None:
        return None
    return b64decode("".join(value.split()), validate=True).decode("utf-8", errors="replace")


class Judge0Client:
    def __init__(
        self,
        http: httpx2.AsyncClient,
        *,
        python_language_id: int,
        request_timeout: float,
        max_poll_seconds: float,
        max_poll_attempts: int,
    ):
        self._http = http
        self._python_language_id = python_language_id
        self._request_timeout = request_timeout
        self._max_poll_seconds = max_poll_seconds
        self._max_poll_attempts = max_poll_attempts
        self._execution_slot = asyncio.BoundedSemaphore(1)

    @property
    def python_language_id(self) -> int:
        return self._python_language_id

    async def list_languages(self) -> list[Judge0Language]:
        response = await self._request("GET", "languages")
        try:
            return _LANGUAGES.validate_json(response)
        except ValidationError:
            raise Judge0Error("judge0_invalid_response") from None

    async def check_health(self) -> Judge0HealthResponse:
        languages = await self.list_languages()
        if not any(
            language.id == self._python_language_id and re.match(r"(?:python|pypy)\b", language.name, re.IGNORECASE)
            for language in languages
        ):
            raise Judge0Error("judge0_invalid_language")
        return Judge0HealthResponse(python_language_id=self._python_language_id, languages=languages)

    async def submit_python(self, source_code: str, stdin: str | None = None) -> UUID:
        await self.check_health()
        payload = {
            "source_code": b64encode(source_code.encode("utf-8")).decode("ascii"),
            "language_id": self._python_language_id,
            "cpu_time_limit": 2,
            "cpu_extra_time": 0,
            "wall_time_limit": 5,
            "memory_limit": 128_000,
            "enable_per_process_and_thread_time_limit": False,
            "enable_per_process_and_thread_memory_limit": False,
            "max_processes_and_or_threads": 8,
            "max_file_size": 64,
            "number_of_runs": 1,
            "enable_network": False,
            "redirect_stderr_to_stdout": False,
        }
        if stdin is not None:
            payload["stdin"] = b64encode(stdin.encode("utf-8")).decode("ascii")
        response = await self._request(
            "POST",
            "submissions",
            params={"base64_encoded": "true", "wait": "false"},
            payload=payload,
            expected_status=201,
        )
        try:
            return _SubmissionToken.model_validate_json(response).token
        except ValidationError:
            raise Judge0Error("judge0_invalid_response") from None

    async def get_submission(self, token: UUID) -> Judge0ExecutionResult:
        response = await self._request(
            "GET",
            f"submissions/{token}",
            params={"base64_encoded": "true", "fields": "status_id,stdout,stderr,compile_output,message,time,memory"},
        )
        try:
            submission = _Submission.model_validate_json(response)
            status_description = _STATUS_DESCRIPTIONS[submission.status_id]
            if submission.status_id == _INTERNAL_ERROR_STATUS_ID:
                # Internal Error fields can contain diagnostics from the Judge0 host.
                return Judge0ExecutionResult(status_id=submission.status_id, status_description=status_description)
            return Judge0ExecutionResult(
                status_id=submission.status_id,
                status_description=status_description,
                stdout=_decode_output(submission.stdout),
                stderr=_decode_output(submission.stderr),
                compile_output=_decode_output(submission.compile_output),
                message=_decode_output(submission.message),
                execution_time=submission.time,
                memory_usage=submission.memory,
            )
        except (ValueError, KeyError):
            raise Judge0Error("judge0_invalid_response") from None

    async def _wait_for_result(self, token: UUID) -> Judge0ExecutionResult:
        try:
            async with asyncio.timeout(self._max_poll_seconds):
                for attempt in range(self._max_poll_attempts):
                    if attempt:
                        await asyncio.sleep(_POLL_INTERVAL_SECONDS)
                    result = await self.get_submission(token)
                    if result.status_id not in _PENDING_STATUS_IDS:
                        return result
        except TimeoutError:
            raise Judge0Error("judge0_poll_timeout") from None
        raise Judge0Error("judge0_poll_timeout")

    @asynccontextmanager
    async def reserve_python_execution(self) -> AsyncIterator[RunPython]:
        if self._execution_slot.locked():
            raise Judge0Error("judge0_busy")
        async with self._execution_slot:
            yield self._execute_python

    async def _execute_python(self, source_code: str, stdin: str | None) -> Judge0ExecutionResult:
        token = await self.submit_python(source_code, stdin)
        return await self._wait_for_result(token)

    async def execute_python(self, source_code: str) -> Judge0ExecutionResult:
        async with self.reserve_python_execution() as run:
            return await run(source_code, None)

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, str] | None = None,
        payload: dict[str, str | int | float | bool] | None = None,
        expected_status: int = 200,
    ) -> bytearray:
        try:
            async with asyncio.timeout(self._request_timeout):
                async with self._http.stream(method, path, params=params, json=payload) as response:
                    code = response.status_code
                    if code == 429 or code >= 500:
                        raise Judge0Error("judge0_unavailable")
                    if code == 422 and method == "POST":
                        raise Judge0Error("judge0_submission_rejected")
                    if code != expected_status:
                        raise Judge0Error("judge0_upstream_error")
                    if response.headers.get("content-encoding", "identity").lower() != "identity":
                        raise Judge0Error("judge0_invalid_response")
                    body = bytearray()
                    async for chunk in response.aiter_bytes():
                        if len(body) + len(chunk) > _MAX_RESPONSE_BYTES:
                            raise Judge0Error("judge0_invalid_response")
                        body.extend(chunk)
                    return body
        except (TimeoutError, httpx2.TimeoutException):
            raise Judge0Error("judge0_request_timeout") from None
        except httpx2.RequestError:
            raise Judge0Error("judge0_unavailable") from None
