from contextlib import contextmanager
from typing import Any
from uuid import UUID

import psycopg
from psycopg.types.json import Jsonb

from app.schemas.attempts import ScanRequest, ScanResponse, StageProgress
from app.services.attempts import Attempt, AttemptError, AttemptErrorCode, ScanEvent
from app.services.st001 import STAGE_ID, STAGE_VERSION

_SELECT_ATTEMPT = """
    select id, qualities, events
    from private.stage_attempts
    where user_id = %s and id = %s and stage_key = %s and stage_version = %s
"""


class PostgresAttemptStore:
    def __init__(self, database_url: str):
        self._database_url = database_url

    def _connect(self):
        return psycopg.connect(self._database_url, connect_timeout=5, prepare_threshold=None)

    def insert(self, user_id: UUID, attempt: Attempt) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                insert into private.stage_attempts (id, user_id, stage_key, stage_version, qualities)
                values (%s, %s, %s, %s, %s)
                """,
                (attempt.id, user_id, STAGE_ID, STAGE_VERSION, list(attempt.qualities)),
            )

    def get(self, user_id: UUID, attempt_id: UUID) -> Attempt:
        with self._connect() as connection:
            row = connection.execute(_SELECT_ATTEMPT, (user_id, attempt_id, STAGE_ID, STAGE_VERSION)).fetchone()
            return _read_attempt(row)

    @contextmanager
    def edit(self, user_id: UUID, attempt_id: UUID):
        with self._connect() as connection:
            row = connection.execute(
                _SELECT_ATTEMPT + " for update", (user_id, attempt_id, STAGE_ID, STAGE_VERSION)
            ).fetchone()
            attempt = _read_attempt(row)
            previous_event_count = len(attempt.events)
            yield attempt

            if len(attempt.events) == previous_event_count:
                return

            progress = attempt.progress
            events = [
                {"request": event.request.model_dump(mode="json"), "response": event.response.model_dump(mode="json")}
                for event in attempt.events.values()
            ]
            connection.execute(
                """
                update private.stage_attempts
                set events = %s, finished_at = case when %s then now() end
                where user_id = %s and id = %s
                """,
                (Jsonb(events), progress.status != "in_progress", user_id, attempt_id),
            )

            if progress.status == "cleared":
                connection.execute(
                    """
                    insert into public.stage_progress (user_id, stage_key, best_scans, clear_count)
                    values (%s, %s, %s, 1)
                    on conflict (user_id, stage_key) do update set
                        best_scans = least(stage_progress.best_scans, excluded.best_scans),
                        clear_count = stage_progress.clear_count + 1,
                        updated_at = now()
                    """,
                    (user_id, STAGE_ID, progress.scans_used),
                )

    def progress(self, user_id: UUID) -> tuple[StageProgress, ...]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                select stage_key, best_scans, clear_count
                from public.stage_progress
                where user_id = %s
                order by stage_key
                """,
                (user_id,),
            ).fetchall()
            return tuple(
                StageProgress(stage_id=stage_key, best_scans=best_scans, clear_count=clear_count)
                for stage_key, best_scans, clear_count in rows
            )


def _read_attempt(row: tuple[Any, ...] | None) -> Attempt:
    if row is None:
        raise AttemptError(AttemptErrorCode.ATTEMPT_NOT_FOUND)

    attempt_id, qualities, records = row
    events: dict[UUID, ScanEvent] = {}
    for record in records:
        request = ScanRequest.model_validate(record["request"])
        response = ScanResponse.model_validate(record["response"])
        events[request.action_id] = ScanEvent(request, response)

    return Attempt(id=attempt_id, qualities=tuple(qualities), events=events)
