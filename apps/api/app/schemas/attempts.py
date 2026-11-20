from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.services.st001 import CONTAINER_COUNT

AttemptStatus = Literal["in_progress", "cleared", "failed"]


class CreateAttemptRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    stage_id: str
    previous_attempt_id: UUID | None = None


class ScanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    index: Annotated[int, Field(strict=True, ge=0, lt=CONTAINER_COUNT)]
    action_id: UUID
    expected_step: Annotated[int, Field(strict=True, ge=0)]


class CandidateRange(BaseModel):
    model_config = ConfigDict(frozen=True)

    lo: int
    hi: int


class AttemptProgress(BaseModel):
    model_config = ConfigDict(frozen=True)

    candidate_range: CandidateRange
    scans_used: int
    scans_remaining: int
    status: AttemptStatus


class InspectionResult(BaseModel):
    model_config = ConfigDict(frozen=True)

    index: int
    quality: int


class AttemptResponse(AttemptProgress):
    id: UUID
    stage_id: str
    scans: tuple[InspectionResult, ...]


class ScanResponse(AttemptProgress):
    index: int
    quality: int


class StageProgress(BaseModel):
    stage_id: str
    best_scans: int
    clear_count: int
