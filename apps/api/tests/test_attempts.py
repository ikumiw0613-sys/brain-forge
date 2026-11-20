from bisect import bisect_left
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import pytest
from app.services import attempts, st001

_ATTEMPTS = "/api/v1/attempts"
_STAGE = {"stage_id": "ST-001"}
_SAMPLE = (8, 15, 20, 24, 31, 37, 42, 46, 51, 58, 63, 68, 72, 76, 83, 91)


@pytest.fixture
def client(monkeypatch, game_client):
    monkeypatch.setattr(attempts, "generate_qualities", lambda _excluded: _SAMPLE)
    with game_client() as test_client:
        yield test_client


def start(client):
    response = client.post(_ATTEMPTS, json=_STAGE)
    assert response.status_code == 201, response.text
    return response.json()


def scan_payload(index, step):
    return {"index": index, "action_id": str(uuid4()), "expected_step": step}


def post_scan(client, attempt_id, index, step):
    return client.post(f"{_ATTEMPTS}/{attempt_id}/scans", json=scan_payload(index, step))


def test_new_attempt_and_first_scan_expose_only_public_state(client):
    created = start(client)
    attempt_id = created["id"]
    assert created == {
        "id": attempt_id,
        "stage_id": "ST-001",
        "candidate_range": {"lo": 0, "hi": 15},
        "scans_used": 0,
        "scans_remaining": 5,
        "status": "in_progress",
        "scans": [],
    }
    assert client.get(f"{_ATTEMPTS}/{attempt_id}").json() == created

    response = post_scan(client, attempt_id, 7, 0)
    assert response.status_code == 200
    assert response.json() == {
        "index": 7,
        "quality": 46,
        "candidate_range": {"lo": 8, "hi": 15},
        "scans_used": 1,
        "scans_remaining": 4,
        "status": "in_progress",
    }
    assert client.get(f"{_ATTEMPTS}/{attempt_id}").json() == {
        **created,
        "candidate_range": {"lo": 8, "hi": 15},
        "scans_used": 1,
        "scans_remaining": 4,
        "scans": [{"index": 7, "quality": 46}],
    }


@pytest.mark.parametrize("answer", range(16))
def test_binary_search_clears_every_possible_answer_in_four_scans(monkeypatch, answer, game_client):
    qualities = tuple(range(answer)) + tuple(range(70, 86 - answer))
    monkeypatch.setattr(attempts, "generate_qualities", lambda _excluded: qualities)

    with game_client() as client:
        progress = start(client)
        attempt_id = progress["id"]
        for step in range(4):
            lo = progress["candidate_range"]["lo"]
            hi = progress["candidate_range"]["hi"]
            response = post_scan(client, attempt_id, (lo + hi) // 2, step)
            assert response.status_code == 200
            progress = response.json()
            if progress["status"] == "cleared":
                break

        assert progress["status"] == "cleared"
        assert progress["candidate_range"] == {"lo": answer, "hi": answer}
        assert progress["scans_used"] <= 4
        later = post_scan(client, attempt_id, 15, progress["scans_used"])
        assert later.status_code == 422
        assert later.json() == {"detail": "attempt_finished"}


def test_scanning_the_answer_does_not_clear_while_earlier_candidates_remain(client):
    attempt_id = start(client)["id"]
    response = post_scan(client, attempt_id, 12, 0)
    assert response.status_code == 200
    assert response.json()["status"] == "in_progress"
    assert response.json()["candidate_range"] == {"lo": 0, "hi": 12}


@pytest.mark.parametrize(
    ("indices", "status", "candidate_range"),
    [
        ([0, 1, 2, 3, 4], "failed", {"lo": 5, "hi": 15}),
        ([0, 7, 11, 14, 12], "cleared", {"lo": 12, "hi": 12}),
    ],
)
def test_last_scan_checks_clear_before_budget_failure(client, indices, status, candidate_range):
    attempt_id = start(client)["id"]

    for step, index in enumerate(indices):
        response = post_scan(client, attempt_id, index, step)
        assert response.status_code == 200
        progress = response.json()
        if step < 4:
            assert progress["status"] == "in_progress"

    assert progress["status"] == status
    assert progress["candidate_range"] == candidate_range
    assert progress["scans_remaining"] == 0
    rejected = post_scan(client, attempt_id, 15, 5)
    assert rejected.status_code == 422
    assert rejected.json() == {"detail": "attempt_finished"}
    assert client.get(f"{_ATTEMPTS}/{attempt_id}").json()["scans_used"] == 5


def test_replay_returns_original_response_without_counting_again(client):
    attempt_id = start(client)["id"]
    url = f"{_ATTEMPTS}/{attempt_id}/scans"
    first_payload = scan_payload(7, 0)
    first = client.post(url, json=first_payload)
    assert first.status_code == 200
    assert post_scan(client, attempt_id, 11, 1).status_code == 200
    assert post_scan(client, attempt_id, 12, 2).json()["status"] == "cleared"

    replay = client.post(url, json=first_payload)
    assert replay.status_code == 200
    assert replay.json() == first.json()
    assert client.get(f"{_ATTEMPTS}/{attempt_id}").json()["scans_used"] == 3


def test_scan_rejects_stale_steps_reused_action_ids_and_duplicate_indices(client):
    attempt_id = start(client)["id"]
    url = f"{_ATTEMPTS}/{attempt_id}/scans"
    first = scan_payload(7, 0)
    assert client.post(url, json=first).status_code == 200

    stale = post_scan(client, attempt_id, 11, 0)
    assert stale.status_code == 409
    assert stale.json() == {"detail": "step_conflict"}

    reused = client.post(url, json={**first, "index": 11, "expected_step": 1})
    assert reused.status_code == 409
    assert reused.json() == {"detail": "action_id_conflict"}
    reused_step = client.post(url, json={**first, "expected_step": 1})
    assert reused_step.status_code == 409

    duplicate = post_scan(client, attempt_id, 7, 1)
    assert duplicate.status_code == 422
    assert duplicate.json() == {"detail": "already_scanned"}
    assert client.get(f"{_ATTEMPTS}/{attempt_id}").json()["scans_used"] == 1


@pytest.mark.parametrize(
    "invalid",
    [
        {"index": -1},
        {"index": 16},
        {"index": "7"},
        {"index": False},
        {"expected_step": -1},
        {"expected_step": "0"},
        {"action_id": "not-a-uuid"},
    ],
)
def test_invalid_scan_requests_leave_attempt_untouched(client, invalid):
    created = start(client)
    url = f"{_ATTEMPTS}/{created['id']}"
    response = client.post(f"{url}/scans", json={**scan_payload(7, 0), **invalid})
    assert response.status_code == 422
    assert client.get(url).json() == created


def test_unknown_attempt_and_stage_return_not_found(client):
    unknown_id = uuid4()
    missing = client.get(f"{_ATTEMPTS}/{unknown_id}")
    assert missing.status_code == 404
    assert missing.json() == {"detail": "attempt_not_found"}
    assert post_scan(client, unknown_id, 7, 0).status_code == 404
    assert client.post(_ATTEMPTS, json={"stage_id": "ST-999"}).status_code == 404
    retry = client.post(_ATTEMPTS, json={**_STAGE, "previous_attempt_id": str(unknown_id)})
    assert retry.status_code == 404


def test_retry_resets_state_and_changes_the_answer(monkeypatch, game_client):
    monkeypatch.setattr(st001._random, "choice", lambda positions: positions[0])
    with game_client() as client:
        original = start(client)
        initial_scan = post_scan(client, original["id"], 0, 0)
        assert initial_scan.json()["status"] == "cleared"
        retry = client.post(_ATTEMPTS, json={**_STAGE, "previous_attempt_id": original["id"]})
        assert retry.status_code == 201
        created = retry.json()
        assert created["id"] != original["id"]
        assert created["scans"] == []
        assert created["candidate_range"] == {"lo": 0, "hi": 15}
        retry_scan = post_scan(client, created["id"], 0, 0)
        assert retry_scan.json()["candidate_range"] == {"lo": 1, "hi": 15}
        assert client.get(f"{_ATTEMPTS}/{original['id']}").json()["status"] == "cleared"


@pytest.mark.parametrize("excluded", [None, *range(16)])
def test_generated_qualities_are_sorted_with_at_least_one_eligible_container(excluded):
    qualities = st001.generate_qualities(excluded)
    assert len(qualities) == 16
    assert list(qualities) == sorted(qualities)
    assert all(0 <= value <= 100 for value in qualities)
    first_eligible = bisect_left(qualities, 70)
    assert first_eligible < len(qualities)
    assert first_eligible != excluded


@pytest.mark.parametrize("same_action", [True, False])
def test_concurrent_scans_cannot_consume_the_same_step_twice(client, same_action):
    attempt_id = start(client)["id"]
    url = f"{_ATTEMPTS}/{attempt_id}/scans"
    barrier = Barrier(2)
    first = scan_payload(7, 0)
    second = first if same_action else scan_payload(11, 0)

    def submit(payload):
        barrier.wait(timeout=5)
        return client.post(url, json=payload)

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(submit, (first, second)))

    if same_action:
        assert [response.status_code for response in responses] == [200, 200]
        assert responses[0].json() == responses[1].json()
    else:
        assert sorted(response.status_code for response in responses) == [200, 409]

    assert client.get(f"{_ATTEMPTS}/{attempt_id}").json()["scans_used"] == 1


def test_vite_can_call_create_attempt_with_json(client):
    origin = "http://localhost:5173"
    response = client.options(
        _ATTEMPTS,
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin
    assert "POST" in response.headers["access-control-allow-methods"]


def test_attempts_and_progress_require_a_verified_user(client):
    for authorization in ("", "Bearer invalid-token"):
        headers = {"Authorization": authorization}
        assert client.post(_ATTEMPTS, json=_STAGE, headers=headers).status_code == 401
        assert client.get("/api/v1/me/progress", headers=headers).status_code == 401


def test_other_user_cannot_fetch_scan_or_retry_an_attempt(client):
    attempt_id = start(client)["id"]
    url = f"{_ATTEMPTS}/{attempt_id}"
    headers = {"Authorization": "Bearer test-other-player"}
    assert client.get(url, headers=headers).status_code == 404
    assert client.post(f"{url}/scans", json=scan_payload(7, 0), headers=headers).status_code == 404
    response = client.post(_ATTEMPTS, json={**_STAGE, "previous_attempt_id": attempt_id}, headers=headers)
    assert response.status_code == 404
    assert client.get(url).json()["scans_used"] == 0
