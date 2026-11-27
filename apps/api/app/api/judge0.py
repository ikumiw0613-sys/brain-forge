import re
from secrets import compare_digest
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import ValidationError

from app.schemas.judge0 import MAX_SOURCE_CHARACTERS, Judge0ExecutionResult, Judge0HealthResponse, Judge0PythonRequest
from app.schemas.sorting_benchmark import SortingBenchmarkResult
from app.schemas.sorting_judge import SortingJudgeResult
from app.services.judge0 import Judge0Client, Judge0Error
from app.services.sorting_benchmark import benchmark_sorting
from app.services.sorting_judge import judge_sorting

router = APIRouter(prefix="/dev/judge0", include_in_schema=False)
_bearer = HTTPBearer(auto_error=False)
_LOCAL_HOST = re.compile(r"(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]+)?", re.IGNORECASE)
# A non-BMP character can occupy 12 bytes when sent as JSON Unicode escapes.
_MAX_BODY_BYTES = 12 * MAX_SOURCE_CHARACTERS + 1024
_ERROR_STATUS = {
    "judge0_busy": 429,
    "judge0_invalid_language": 503,
    "judge0_unavailable": 503,
    "judge0_request_timeout": 504,
    "judge0_poll_timeout": 504,
    "judge0_invalid_response": 502,
    "judge0_submission_rejected": 502,
    "judge0_upstream_error": 502,
}


async def handle_judge0_error(_request: Request, error: Judge0Error) -> JSONResponse:
    detail = str(error)
    return JSONResponse(status_code=_ERROR_STATUS[detail], content={"detail": detail}, headers={"Cache-Control": "no-store"})


async def get_local_judge0(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> Judge0Client:
    client: Judge0Client | None = getattr(request.app.state, "judge0", None)
    if client is None:
        raise HTTPException(404, "Not Found")
    if (
        request.client is None
        or request.client.host not in {"127.0.0.1", "::1"}
        or not _LOCAL_HOST.fullmatch(request.headers.get("host", ""))
        or any(name == "forwarded" or name.startswith("x-forwarded-") for name in request.headers)
    ):
        raise HTTPException(404, "Not Found")

    token = request.app.state.settings.judge0_dev_token.get_secret_value()
    if credentials is None or not compare_digest(credentials.credentials.encode(), token.encode()):
        raise HTTPException(401, "invalid_judge0_dev_token", headers={"WWW-Authenticate": "Bearer"})
    return client


LocalJudge0 = Annotated[Judge0Client, Depends(get_local_judge0)]


@router.get("/health")
async def health(client: LocalJudge0, response: Response) -> Judge0HealthResponse:
    response.headers["Cache-Control"] = "no-store"
    return await client.check_health()


async def _read_python_source(request: Request) -> str:
    if request.headers.get("content-type", "").partition(";")[0].strip().lower() != "application/json":
        raise HTTPException(415, "json_required")

    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > _MAX_BODY_BYTES:
            raise HTTPException(413, "judge0_source_too_large")
        body.extend(chunk)
    try:
        return Judge0PythonRequest.model_validate_json(body).source_code
    except ValidationError as error:
        for issue in error.errors(include_input=False):
            if issue["loc"] == ("source_code",) and issue["type"] == "string_too_long":
                raise HTTPException(413, "judge0_source_too_large") from None
        raise HTTPException(422, "invalid_judge0_source") from None


@router.post("/execute")
async def execute(request: Request, client: LocalJudge0, response: Response) -> Judge0ExecutionResult:
    response.headers["Cache-Control"] = "no-store"
    return await client.execute_python(await _read_python_source(request))


@router.post("/sorting/judge")
async def sorting_judge(request: Request, client: LocalJudge0, response: Response) -> SortingJudgeResult:
    response.headers["Cache-Control"] = "no-store"
    result = await judge_sorting(client, await _read_python_source(request))
    if result.status == "unavailable":
        response.status_code = 503
    return result


@router.post("/sorting/benchmark")
async def sorting_benchmark(request: Request, client: LocalJudge0, response: Response) -> SortingBenchmarkResult:
    response.headers["Cache-Control"] = "no-store"
    result = await benchmark_sorting(client, await _read_python_source(request))
    if result.algorithm_status == "unavailable":
        response.status_code = 503
    return result
