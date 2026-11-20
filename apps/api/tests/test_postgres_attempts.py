from concurrent.futures import ThreadPoolExecutor
from os import getenv
from threading import Barrier

import psycopg
import pytest
from psycopg.errors import InsufficientPrivilege

from app.services import attempts
from app.services.postgres_attempts import PostgresAttemptStore
from test_attempts import _ATTEMPTS, _SAMPLE, _STAGE, post_scan, scan_payload, start

_PROGRESS = "/api/v1/me/progress"


@pytest.fixture
def database(game_users, monkeypatch):
    admin_dsn = getenv("BRAIN_FORGE_TEST_ADMIN_DSN")
    api_dsn = getenv("BRAIN_FORGE_TEST_API_DSN")
    if not (admin_dsn and api_dsn):
        pytest.skip("Requires a migrated PostgreSQL test database and a brain_forge_api connection")

    monkeypatch.setattr(attempts, "generate_qualities", lambda _excluded: _SAMPLE)
    with psycopg.connect(admin_dsn, autocommit=True) as admin:
        users = tuple(game_users.values())
        admin.execute("insert into auth.users (id) values (%s), (%s)", users)
        try:
            yield admin, api_dsn
        finally:
            admin.execute("delete from auth.users where id in (%s, %s)", users)


def test_postgres_persists_attempt_across_startups_and_tracks_progress(database, game_client):
    _, dsn = database
    with game_client(PostgresAttemptStore(dsn)) as client:
        attempt_id = start(client)["id"]
        first = post_scan(client, attempt_id, 7, 0)
        assert first.status_code == 200
        assert first.json()["scans_used"] == 1
        assert client.get(_PROGRESS).json() == []
        assert post_scan(client, attempt_id, 11, 1).status_code == 200

    with game_client(PostgresAttemptStore(dsn)) as client:
        url = f"{_ATTEMPTS}/{attempt_id}"
        other = {"Authorization": "Bearer test-other-player"}
        assert client.get(url, headers=other).status_code == 404
        assert client.post(f"{url}/scans", json=scan_payload(12, 2), headers=other).status_code == 404
        assert client.post(_ATTEMPTS, json={**_STAGE, "previous_attempt_id": attempt_id}, headers=other).status_code == 404
        assert client.get(url).json()["scans"] == [{"index": 7, "quality": 46}, {"index": 11, "quality": 68}]

        final_payload = scan_payload(12, 2)
        completed = client.post(f"{url}/scans", json=final_payload)
        assert completed.status_code == 200
        assert completed.json()["status"] == "cleared"
        assert client.post(f"{url}/scans", json=final_payload).json() == completed.json()
        assert client.get(_PROGRESS).json() == [{"stage_id": "ST-001", "best_scans": 3, "clear_count": 1}]

        for sequence, status, best, count in (
            ([0, 1, 2, 3, 4], "failed", 3, 1),
            ([0, 7, 11, 14, 12], "cleared", 3, 2),
            ([11, 12], "cleared", 2, 3),
        ):
            new_id = start(client)["id"]
            for step, index in enumerate(sequence):
                last = post_scan(client, new_id, index, step)
                assert last.status_code == 200
            assert last.json()["status"] == status
            assert client.get(_PROGRESS).json() == [{"stage_id": "ST-001", "best_scans": best, "clear_count": count}]

        assert client.get(_PROGRESS, headers=other).json() == []


def test_concurrent_clear_replays_count_once_in_postgres(database, game_client):
    _, dsn = database
    with game_client(PostgresAttemptStore(dsn)) as client:
        attempt_id = start(client)["id"]
        assert post_scan(client, attempt_id, 11, 0).status_code == 200
        final_payload = scan_payload(12, 1)
        barrier = Barrier(2)

        def submit(_):
            barrier.wait(timeout=5)
            return client.post(f"{_ATTEMPTS}/{attempt_id}/scans", json=final_payload)

        with ThreadPoolExecutor(max_workers=2) as pool:
            first, second = pool.map(submit, range(2))

        assert first.status_code == second.status_code == 200
        assert first.json() == second.json()
        assert first.json()["status"] == "cleared"
        assert client.get(_PROGRESS).json() == [{"stage_id": "ST-001", "best_scans": 2, "clear_count": 1}]


def test_progress_rls_exposes_only_own_row_and_disallows_browser_writes(database, game_users):
    admin, _ = database
    first, second = game_users.values()
    admin.execute(
        "insert into public.stage_progress (user_id, stage_key, best_scans, clear_count) values"
        " (%s, 'ST-001', 2, 1), (%s, 'ST-001', 3, 1)",
        (first, second),
    )

    with admin.transaction():
        admin.execute("set local role authenticated")
        admin.execute("select set_config('request.jwt.claim.sub', %s, true)", (str(first),))
        assert admin.execute("select user_id from public.stage_progress").fetchall() == [(first,)]
        for statement in (
            "select qualities from private.stage_attempts",
            "update public.stage_progress set best_scans = 1",
            "insert into public.stage_progress (user_id, stage_key, best_scans, clear_count) "
            "values (auth.uid(), 'ST-999', 1, 1)",
        ):
            with pytest.raises(InsufficientPrivilege), admin.transaction():
                admin.execute(statement)

    with pytest.raises(InsufficientPrivilege), admin.transaction():
        admin.execute("set local role anon")
        admin.execute("select user_id from public.stage_progress")
