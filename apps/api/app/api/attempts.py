from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse

from app.core.auth import AuthenticatedUser
from app.schemas.attempts import AttemptResponse, CreateAttemptRequest, ScanRequest, ScanResponse, StageProgress
from app.services.attempts import AttemptError, AttemptErrorCode, AttemptService

router = APIRouter(tags=["attempts"])

_ERROR_STATUS = {
    AttemptErrorCode.STAGE_NOT_FOUND: status.HTTP_404_NOT_FOUND,
    AttemptErrorCode.ATTEMPT_NOT_FOUND: status.HTTP_404_NOT_FOUND,
    AttemptErrorCode.ACTION_ID_CONFLICT: status.HTTP_409_CONFLICT,
    AttemptErrorCode.STEP_CONFLICT: status.HTTP_409_CONFLICT,
    AttemptErrorCode.ALREADY_SCANNED: status.HTTP_422_UNPROCESSABLE_CONTENT,
    AttemptErrorCode.ATTEMPT_FINISHED: status.HTTP_422_UNPROCESSABLE_CONTENT,
}


async def handle_attempt_error(_request: Request, error: AttemptError) -> JSONResponse:
    return JSONResponse(status_code=_ERROR_STATUS[error.code], content={"detail": error.code})


def get_attempt_service(request: Request) -> AttemptService:
    service: AttemptService | None = request.app.state.attempt_service
    if service is None:
        raise HTTPException(503, "database_not_configured")
    return service


Attempts = Annotated[AttemptService, Depends(get_attempt_service)]


@router.post("/attempts", status_code=status.HTTP_201_CREATED)
def create_attempt(body: CreateAttemptRequest, user_id: AuthenticatedUser, attempts: Attempts) -> AttemptResponse:
    """Start ST-001. Supply the previous attempt ID to retry with a different answer."""
    return attempts.create(user_id, body.stage_id, body.previous_attempt_id)


@router.get("/attempts/{attempt_id}")
def get_attempt(attempt_id: UUID, user_id: AuthenticatedUser, attempts: Attempts) -> AttemptResponse:
    """Get the latest candidate range, scan budget, and completed scans."""
    return attempts.get(user_id, attempt_id)


@router.post("/attempts/{attempt_id}/scans")
def scan(attempt_id: UUID, body: ScanRequest, user_id: AuthenticatedUser, attempts: Attempts) -> ScanResponse:
    """Inspect a zero-based index. Repeat the same body to recover a lost response."""
    return attempts.scan(user_id, attempt_id, body)


@router.get("/me/progress")
def get_my_progress(user_id: AuthenticatedUser, attempts: Attempts) -> tuple[StageProgress, ...]:
    """Get the authenticated player's clear counts and best scan counts."""
    return attempts.progress(user_id)
