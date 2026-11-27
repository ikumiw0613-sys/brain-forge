from os import getenv

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import app

pytestmark = pytest.mark.skipif(
    getenv("BRAIN_FORGE_RUN_JUDGE0_E2E") != "1",
    reason="Opt in to using the configured Judge0 instance with BRAIN_FORGE_RUN_JUDGE0_E2E=1",
)


@pytest.fixture(scope="module")
def judge_client():
    settings = Settings()
    if not settings.judge0_enabled or settings.judge0_dev_token is None:
        pytest.fail("Enable the development API and configure Judge0 before running E2E tests")
    headers = {"Authorization": f"Bearer {settings.judge0_dev_token.get_secret_value()}"}
    with TestClient(app, base_url="http://127.0.0.1:8000", client=("127.0.0.1", 50000), headers=headers) as client:
        response = client.get("/api/v1/dev/judge0/health")
        assert response.status_code == 200, response.json().get("detail")
        yield client


def _judge(client, source):
    response = client.post("/api/v1/dev/judge0/sorting/judge", json={"source_code": source})
    assert response.status_code == 200, response.text
    return response.json()


def test_judge0_accepts_in_place_sort_with_stdout(judge_client):
    result = _judge(judge_client, 'def sort_parts(a):\n    print("sorting")\n    a.sort()\n    return a')
    assert result["status"] == "passed", result
    assert result["passed_cases"] == result["total_cases"] == 8


def test_judge0_rejects_dropped_duplicates(judge_client):
    result = _judge(judge_client, "def sort_parts(a):\n    return sorted(set(a))")
    assert result["status"] == "failed", result
    assert next(case["reason"] for case in result["cases"] if case["name"] == "duplicates") == "wrong_length"


def test_judge0_stops_after_time_limit(judge_client):
    result = _judge(judge_client, "def sort_parts(a):\n    while True: pass")
    assert result["status"] == "failed", result
    assert [case["reason"] for case in result["cases"]] == ["time_limit_exceeded"] + ["not_run"] * 7
