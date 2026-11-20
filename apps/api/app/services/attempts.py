from bisect import bisect_left
from contextlib import AbstractContextManager
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Protocol
from uuid import UUID, uuid4

from app.schemas.attempts import (
    AttemptProgress,
    AttemptResponse,
    AttemptStatus,
    CandidateRange,
    InspectionResult,
    ScanRequest,
    ScanResponse,
    StageProgress,
)
from app.services.st001 import CONTAINER_COUNT, QUALITY_THRESHOLD, SCAN_LIMIT, STAGE_ID, generate_qualities


class AttemptErrorCode(StrEnum):
    STAGE_NOT_FOUND = "stage_not_found"
    ATTEMPT_NOT_FOUND = "attempt_not_found"
    ACTION_ID_CONFLICT = "action_id_conflict"
    STEP_CONFLICT = "step_conflict"
    ALREADY_SCANNED = "already_scanned"
    ATTEMPT_FINISHED = "attempt_finished"


class AttemptError(Exception):
    def __init__(self, code: AttemptErrorCode):
        super().__init__(code)
        self.code = code


_INITIAL_PROGRESS = AttemptProgress(
    candidate_range=CandidateRange(lo=0, hi=CONTAINER_COUNT - 1),
    scans_used=0,
    scans_remaining=SCAN_LIMIT,
    status="in_progress",
)


@dataclass(frozen=True, slots=True)
class ScanEvent:
    request: ScanRequest
    response: ScanResponse


@dataclass(slots=True)
class Attempt:
    id: UUID
    qualities: tuple[int, ...]
    events: dict[UUID, ScanEvent] = field(default_factory=dict)

    @property
    def progress(self) -> AttemptProgress:
        if not self.events:
            return _INITIAL_PROGRESS
        return next(reversed(self.events.values())).response

    def snapshot(self) -> AttemptResponse:
        progress = self.progress
        return AttemptResponse(
            id=self.id,
            stage_id=STAGE_ID,
            candidate_range=progress.candidate_range,
            scans_used=progress.scans_used,
            scans_remaining=progress.scans_remaining,
            status=progress.status,
            scans=tuple(
                InspectionResult(index=event.response.index, quality=event.response.quality)
                for event in self.events.values()
            ),
        )

    def scan(self, request: ScanRequest) -> ScanResponse:
        recorded = self.events.get(request.action_id)
        if recorded is not None:
            if recorded.request != request:
                raise AttemptError(AttemptErrorCode.ACTION_ID_CONFLICT)
            return recorded.response

        progress = self.progress
        if progress.status != "in_progress":
            raise AttemptError(AttemptErrorCode.ATTEMPT_FINISHED)
        if request.expected_step != progress.scans_used:
            raise AttemptError(AttemptErrorCode.STEP_CONFLICT)
        if any(event.request.index == request.index for event in self.events.values()):
            raise AttemptError(AttemptErrorCode.ALREADY_SCANNED)

        index = request.index
        quality = self.qualities[index]
        lo, hi = progress.candidate_range.lo, progress.candidate_range.hi
        if quality < QUALITY_THRESHOLD:
            lo = max(lo, index + 1)
        else:
            hi = min(hi, index)
        if lo > hi:
            raise RuntimeError("Scan produced an inconsistent candidate range")

        scans_used = progress.scans_used + 1
        scans_remaining = SCAN_LIMIT - scans_used
        status: AttemptStatus = "in_progress"
        if lo == hi:
            status = "cleared"
        elif scans_remaining == 0:
            status = "failed"

        response = ScanResponse(
            index=index,
            quality=quality,
            candidate_range=CandidateRange(lo=lo, hi=hi),
            scans_used=scans_used,
            scans_remaining=scans_remaining,
            status=status,
        )
        self.events[request.action_id] = ScanEvent(request, response)
        return response


class AttemptStore(Protocol):
    def insert(self, user_id: UUID, attempt: Attempt) -> None: ...

    def get(self, user_id: UUID, attempt_id: UUID) -> Attempt: ...

    def edit(self, user_id: UUID, attempt_id: UUID) -> AbstractContextManager[Attempt]: ...

    def progress(self, user_id: UUID) -> tuple[StageProgress, ...]: ...


class AttemptService:
    def __init__(self, store: AttemptStore):
        self._store = store

    def create(self, user_id: UUID, stage_id: str, previous_attempt_id: UUID | None) -> AttemptResponse:
        if stage_id != STAGE_ID:
            raise AttemptError(AttemptErrorCode.STAGE_NOT_FOUND)

        excluded_index = None
        if previous_attempt_id is not None:
            previous = self._store.get(user_id, previous_attempt_id)
            excluded_index = bisect_left(previous.qualities, QUALITY_THRESHOLD)
        attempt = Attempt(id=uuid4(), qualities=generate_qualities(excluded_index))
        self._store.insert(user_id, attempt)
        return attempt.snapshot()

    def get(self, user_id: UUID, attempt_id: UUID) -> AttemptResponse:
        return self._store.get(user_id, attempt_id).snapshot()

    def scan(self, user_id: UUID, attempt_id: UUID, request: ScanRequest) -> ScanResponse:
        with self._store.edit(user_id, attempt_id) as attempt:
            return attempt.scan(request)

    def progress(self, user_id: UUID) -> tuple[StageProgress, ...]:
        return self._store.progress(user_id)
