import asyncio
import json
from base64 import b64decode, b64encode
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from subprocess import run
from sys import executable
from threading import Event

import httpx2
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings
from app.main import app
from app.schemas.judge0 import MAX_SOURCE_CHARACTERS
from app.services import judge0, sorting_benchmark, sorting_judge

_PATH = "/api/v1/dev/judge0"
_BASE_URL = "https://judge.example/judge0"
_LANGUAGE_ID = 123
_LANGUAGES = [{"id": _LANGUAGE_ID, "name": "Python for ML (3.11.2)"}, {"id": 78, "name": "Swift"}]
_SUBMISSION_TOKEN = "e80153f5-e7d8-4cd2-8b20-6c0ddbf9e3bf"
_AUTH = {"Authorization": f"Bearer {'local_test_' * 4}"}


@pytest.fixture(autouse=True)
def isolated_settings(monkeypatch):
    monkeypatch.setitem(Settings.model_config, "env_file", None)
    for name in Settings.model_fields:
        if name == "app_env" or name.startswith("judge0_"):
            monkeypatch.delenv(name.upper(), raising=False)


@pytest.fixture
def configured(monkeypatch):
    for name, value in {
        "APP_ENV": "development",
        "JUDGE0_DEV_ENABLED": "true",
        "JUDGE0_DEV_TOKEN": _AUTH["Authorization"].split()[1],
        "JUDGE0_BASE_URL": _BASE_URL,
        "JUDGE0_PYTHON_LANGUAGE_ID": str(_LANGUAGE_ID),
        "JUDGE0_AUTH_TOKEN": "upstream-test-token",
    }.items():
        monkeypatch.setenv(name, value)


@pytest.fixture
def open_client(configured, monkeypatch):
    real_async_client = httpx2.AsyncClient
    monkeypatch.setattr(judge0, "_POLL_INTERVAL_SECONDS", 0)

    @contextmanager
    def open_with_transport(handler, *, address="127.0.0.1"):
        def mock_async_client(**kwargs):
            assert kwargs["base_url"] == _BASE_URL
            assert not kwargs["trust_env"]
            assert not kwargs["follow_redirects"]
            return real_async_client(transport=httpx2.MockTransport(handler), **kwargs)

        monkeypatch.setattr(httpx2, "AsyncClient", mock_async_client)
        with TestClient(app, base_url="http://127.0.0.1:8000", client=(address, 50000)) as client:
            yield client

    return open_with_transport


def _encode(text):
    return b64encode(text.encode()).decode() + "\n"


def _execute(client, source="print(1 + 2)"):
    return client.post(f"{_PATH}/execute", headers=_AUTH, json={"source_code": source})


def _submission_flow(request, polls):
    if request.url.path == "/judge0/languages":
        return httpx2.Response(200, json=_LANGUAGES)
    if request.url.path == "/judge0/submissions":
        return httpx2.Response(201, json={"token": _SUBMISSION_TOKEN})
    assert request.url.path == f"/judge0/submissions/{_SUBMISSION_TOKEN}"
    return httpx2.Response(200, json=next(polls))


def test_health_lists_active_languages(open_client):
    def upstream(request):
        assert request.method == "GET"
        assert str(request.url) == f"{_BASE_URL}/languages"
        assert request.headers["X-Auth-Token"] == "upstream-test-token"
        assert "Authorization" not in request.headers
        return httpx2.Response(200, json=_LANGUAGES)

    with open_client(upstream) as client:
        response = client.get(f"{_PATH}/health", headers=_AUTH)

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "python_language_id": _LANGUAGE_ID, "languages": _LANGUAGES}


def test_accepted_submission_polls_until_terminal(open_client):
    calls = []
    polls = iter([
        {"status_id": 1},
        {"status_id": 2},
        {"status_id": 3, "stdout": _encode("3\n"), "time": "0.011", "memory": 6496},
    ])

    def upstream(request):
        calls.append(request.method)
        if request.method == "POST":
            assert request.url.params == httpx2.QueryParams(base64_encoded="true", wait="false")
            payload = json.loads(request.content)
            assert b64decode(payload.pop("source_code")) == "# 日本語\nprint(1 + 2)".encode()
            assert payload == {
                "language_id": _LANGUAGE_ID,
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
        elif "/submissions/" in request.url.path:
            assert request.url.params["base64_encoded"] == "true"
            assert request.url.params["fields"] == "status_id,stdout,stderr,compile_output,message,time,memory"
        return _submission_flow(request, polls)

    with open_client(upstream) as client:
        assert calls == []
        response = _execute(client, "# 日本語\nprint(1 + 2)")

    assert calls == ["GET", "POST", "GET", "GET", "GET"]
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "no-store"
    assert response.json() == {
        "stdout": "3\n",
        "stderr": None,
        "compile_output": None,
        "message": None,
        "status_id": 3,
        "status_description": "Accepted",
        "execution_time": 0.011,
        "memory_usage": 6496,
    }


@pytest.mark.parametrize(
    ("source", "upstream_result", "expected"),
    [
        (
            "raise RuntimeError('test')",
            {"status_id": 11, "stderr": _encode("RuntimeError: test\n"), "message": _encode("Exited with error status 1")},
            {"status_description": "Runtime Error (NZEC)", "stderr": "RuntimeError: test\n", "message": "Exited with error status 1"},
        ),
        (
            "while True: pass",
            {"status_id": 5, "time": "2.001", "memory": None, "message": _encode("Time limit exceeded")},
            {"status_description": "Time Limit Exceeded", "execution_time": 2.001, "message": "Time limit exceeded"},
        ),
        (
            "print(3)",
            {"status_id": 13, "stderr": _encode("internal trace"), "message": _encode(_BASE_URL)},
            {"status_description": "Internal Error"},
        ),
    ],
)
def test_terminal_results(open_client, source, upstream_result, expected):
    polls = iter([upstream_result])
    with open_client(lambda request: _submission_flow(request, polls)) as client:
        response = _execute(client, source)

    assert response.status_code == 200
    assert response.json() == {
        "status_id": upstream_result["status_id"],
        **dict.fromkeys(("stdout", "stderr", "compile_output", "message", "execution_time", "memory_usage")),
        **expected,
    }


@pytest.mark.parametrize(
    ("error", "status", "detail"),
    [(httpx2.ConnectTimeout, 504, "judge0_request_timeout"), (httpx2.ConnectError, 503, "judge0_unavailable")],
)
def test_connection_failures_do_not_affect_game_health(open_client, error, status, detail):
    def upstream(request):
        raise error(f"private connection error for {request.url}")

    with open_client(upstream) as client:
        response = client.get(f"{_PATH}/health", headers=_AUTH)
        assert _execute(client).json() == {"detail": detail}
        assert client.get("/api/v1/health").status_code == 200

    assert response.status_code == status
    assert response.json() == {"detail": detail}


@pytest.mark.parametrize(
    ("reply", "status", "detail"),
    [
        (httpx2.Response(200, text="<html>private error</html>"), 502, "judge0_invalid_response"),
        (httpx2.Response(200, json=[{"id": "123", "name": "Python"}]), 502, "judge0_invalid_response"),
        (httpx2.Response(503, text="private upstream error"), 503, "judge0_unavailable"),
        (httpx2.Response(307, headers={"Location": "https://other.example/languages"}), 502, "judge0_upstream_error"),
    ],
)
def test_bad_upstream_http_responses(open_client, reply, status, detail):
    def upstream(request):
        assert str(request.url) == f"{_BASE_URL}/languages"
        return reply

    with open_client(upstream) as client:
        response = client.get(f"{_PATH}/health", headers=_AUTH)

    assert response.status_code == status
    assert response.json() == {"detail": detail}


@pytest.mark.parametrize("bad_result", [{"status_id": 99}, {"status_id": "3"}, {"stdout": ""}, {"status_id": 3, "stdout": "!"}])
def test_malformed_submission_results(open_client, bad_result):
    polls = iter([bad_result])
    with open_client(lambda request: _submission_flow(request, polls)) as client:
        response = _execute(client)

    assert response.status_code == 502
    assert response.json() == {"detail": "judge0_invalid_response"}


def test_invalid_submission_token_cannot_supply_a_path(open_client):
    def upstream(request):
        if request.method == "POST":
            return httpx2.Response(201, json={"token": "https://other.example/"})
        assert request.url.path == "/judge0/languages"
        return httpx2.Response(200, json=_LANGUAGES)

    with open_client(upstream) as client:
        response = _execute(client)

    assert response.status_code == 502
    assert response.json() == {"detail": "judge0_invalid_response"}


@pytest.mark.parametrize("language_id", [78, 999])
def test_language_must_be_an_active_python(open_client, monkeypatch, language_id):
    monkeypatch.setenv("JUDGE0_PYTHON_LANGUAGE_ID", str(language_id))

    def upstream(request):
        assert request.url.path == "/judge0/languages"
        return httpx2.Response(200, json=_LANGUAGES)

    with open_client(upstream) as client:
        for response in (client.get(f"{_PATH}/health", headers=_AUTH), _execute(client)):
            assert response.status_code == 503
            assert response.json() == {"detail": "judge0_invalid_language"}


def _unexpected_request(_request):
    pytest.fail("Judge0 should not be contacted")


@pytest.mark.parametrize("source", ["a" * (MAX_SOURCE_CHARACTERS + 1), "a" * (13 * MAX_SOURCE_CHARACTERS)])
def test_oversized_source_is_rejected(open_client, source):
    with open_client(_unexpected_request) as client:
        response = _execute(client, source)
    assert response.status_code == 413
    assert response.json() == {"detail": "judge0_source_too_large"}


def test_character_limit_allows_non_bmp_json_escapes(open_client):
    source = "🐍" * MAX_SOURCE_CHARACTERS
    polls = iter([{"status_id": 3}])

    def upstream(request):
        if request.method == "POST":
            assert b64decode(json.loads(request.content)["source_code"]).decode() == source
        return _submission_flow(request, polls)

    with open_client(upstream) as client:
        response = client.post(
            f"{_PATH}/execute",
            headers={**_AUTH, "Content-Type": "application/json"},
            content=json.dumps({"source_code": source}, ensure_ascii=True),
        )
    assert response.status_code == 200


@pytest.mark.parametrize("payload", [{"source_code": "print(3)", "base_url": "https://other.example"}, {"source_code": 3}, {}])
def test_execute_accepts_only_source_code(open_client, payload):
    with open_client(_unexpected_request) as client:
        response = client.post(f"{_PATH}/execute", headers=_AUTH, json=payload)
    assert response.status_code == 422
    assert response.json() == {"detail": "invalid_judge0_source"}


def test_poll_attempt_cap(open_client, monkeypatch):
    monkeypatch.setenv("JUDGE0_MAX_POLL_ATTEMPTS", "2")
    polls = iter([{"status_id": 1}, {"status_id": 2}])

    with open_client(lambda request: _submission_flow(request, polls)) as client:
        response = _execute(client)

    assert next(polls, None) is None
    assert response.status_code == 504
    assert response.json() == {"detail": "judge0_poll_timeout"}


@pytest.mark.parametrize(
    ("request_seconds", "poll_seconds", "detail"),
    [(0.02, 1, "judge0_request_timeout"), (1, 0.02, "judge0_poll_timeout")],
)
def test_deadlines_cancel_a_stalled_poll(open_client, monkeypatch, request_seconds, poll_seconds, detail):
    monkeypatch.setenv("JUDGE0_REQUEST_TIMEOUT", str(request_seconds))
    monkeypatch.setenv("JUDGE0_MAX_POLL_SECONDS", str(poll_seconds))
    cancelled = False

    async def upstream(request):
        nonlocal cancelled
        if request.url.path.endswith(_SUBMISSION_TOKEN):
            try:
                await asyncio.sleep(5)
            finally:
                cancelled = True
        return _submission_flow(request, iter([]))

    with open_client(upstream) as client:
        response = _execute(client)

    assert cancelled
    assert response.status_code == 504
    assert response.json() == {"detail": detail}


def test_only_one_execution_is_in_flight(open_client):
    started = Event()
    finish = Event()

    async def upstream(request):
        if request.method == "POST":
            started.set()
            assert await asyncio.to_thread(finish.wait, 2)
        return _submission_flow(request, iter([{"status_id": 3}]))

    with open_client(upstream) as client, ThreadPoolExecutor(max_workers=1) as pool:
        first = pool.submit(_execute, client)
        try:
            assert started.wait(2)
            second = _execute(client)
            assert second.status_code == 429
            assert second.json() == {"detail": "judge0_busy"}
            assert client.get("/api/v1/health").status_code == 200
        finally:
            finish.set()
        assert first.result(timeout=2).status_code == 200
        assert _execute(client).status_code == 200


@pytest.mark.parametrize("auth", [{}, {"Authorization": "Bearer invalid"}])
def test_local_routes_require_dedicated_bearer_token(open_client, auth):
    with open_client(_unexpected_request) as client:
        for response in (
            client.get(f"{_PATH}/health", headers=auth),
            client.post(f"{_PATH}/execute", headers=auth, json={"source_code": "print(3)"}),
        ):
            assert response.status_code == 401
            assert response.headers["WWW-Authenticate"] == "Bearer"


@pytest.mark.parametrize(
    ("address", "headers"),
    [
        ("192.0.2.10", {}),
        ("192.0.2.10", {"X-Forwarded-For": "127.0.0.1"}),
        ("127.0.0.1", {"Forwarded": "for=192.0.2.10"}),
        ("127.0.0.1", {"Host": "other.example"}),
    ],
)
def test_routes_require_direct_loopback(open_client, address, headers):
    with open_client(_unexpected_request, address=address) as client:
        response = client.get(f"{_PATH}/health", headers={**_AUTH, **headers})
    assert response.status_code == 404


def test_dev_routes_are_disabled_in_production_even_if_opted_in(configured, monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setattr(httpx2, "AsyncClient", _unexpected_request)
    with TestClient(app, base_url="http://localhost", client=("127.0.0.1", 50000)) as client:
        assert client.get(f"{_PATH}/health", headers=_AUTH).status_code == 404
        assert _execute(client).status_code == 404
        assert not any("/dev/judge0" in path for path in client.get("/openapi.json").json()["paths"])


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("JUDGE0_BASE_URL", ""),
        ("JUDGE0_BASE_URL", "ftp://judge.example"),
        ("JUDGE0_BASE_URL", "https://user:secret@judge.example/?token=value"),
        ("JUDGE0_PYTHON_LANGUAGE_ID", "0"),
        ("JUDGE0_PYTHON_LANGUAGE_ID", "invalid"),
        ("JUDGE0_REQUEST_TIMEOUT", "inf"),
        ("JUDGE0_MAX_POLL_SECONDS", "0"),
        ("JUDGE0_MAX_POLL_ATTEMPTS", "121"),
        ("JUDGE0_DEV_TOKEN", "too-short-secret"),
    ],
)
def test_configuration_validation_on_startup(configured, monkeypatch, name, value):
    monkeypatch.setenv(name, value)
    with pytest.raises(ValidationError) as error, TestClient(app):
        pytest.fail("invalid configuration should prevent startup")
    assert "too-short-secret" not in str(error.value)
    assert "user:secret@" not in str(error.value)


_SORTING_PATH = f"{_PATH}/sorting/judge"
_SORTING_SOURCE = "def sort_parts(a):\n    return sorted(a)"
_CASE_NAMES = ["random", "reverse", "sorted", "duplicates", "all_equal", "single", "empty", "negative_and_zero"]


def _judge_sorting(client, *, source=_SORTING_SOURCE, headers=_AUTH):
    return client.post(_SORTING_PATH, headers=headers, json={"source_code": source})


def _sorting_result(values):
    return {"status_id": 3, "stdout": _encode(json.dumps({"kind": "result", "values": values}))}


_BENCHMARK_PATH = f"{_PATH}/sorting/benchmark"


class BenchmarkTransport:
    def __init__(self, correctness=sorted, measure=None):
        self.correctness = correctness
        self.measure = measure or self.completed
        self.jobs = []

    @staticmethod
    def completed(_parts):
        return {
            "status_id": 3, "time": "0.021",
            "stdout": _encode(json.dumps({"python_version": "3.11.2", "outcome": "completed", "samples": [9, 1, 3, 2, 5]})),
        }

    def __call__(self, request):
        if request.method == "POST":
            payload = json.loads(request.content)
            assert (payload["cpu_time_limit"], payload["wall_time_limit"], payload["enable_network"]) == (2, 5, False)
            source = b64decode(payload["source_code"]).decode()
            stdin = json.loads(b64decode(payload["stdin"]))
            self.jobs.append((source, stdin))
        if request.url.path.endswith(_SUBMISSION_TOKEN):
            source, stdin = self.jobs[-1]
            if source == sorting_judge._PYTHON_HARNESS:
                result = _sorting_result(self.correctness(stdin["parts"]))
            else:
                assert source == sorting_benchmark._HARNESS
                assert stdin["runs"] == 5
                result = self.measure(stdin["parts"])
            return httpx2.Response(503) if result is None else _submission_flow(request, iter([result]))
        return _submission_flow(request, iter(()))


def _benchmark(client, headers=_AUTH):
    return client.post(_BENCHMARK_PATH, headers=headers, json={"source_code": _SORTING_SOURCE})


def test_benchmark_job_budget_seed_and_median(open_client):
    upstream = BenchmarkTransport()
    with open_client(upstream) as client:
        response = _benchmark(client)
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "no-store"
    result = response.json()
    assert result["algorithm_status"] == "completed" and result["correctness_passed"]
    assert (result["python_version"], result["judge0_language_id"]) == ("3.11.2", _LANGUAGE_ID)
    assert len(upstream.jobs) == 20
    cases = result["measurements"]
    assert [item["size"] for item in cases] == [100] * 4 + [1000] * 4 + [10000] * 4
    for (_, stdin), item in zip(upstream.jobs[8:], cases, strict=True):
        assert stdin["parts"] == sorting_benchmark.benchmark_input(item["size"], item["distribution"])
        assert (item["successful_runs"], item["seed"], item["status"], item["error_message"]) == (5, 42, "completed", None)
        assert (item["median_ms"], item["min_ms"], item["max_ms"], item["judge0_cpu_ms"]) == (3, 1, 9, 21)


def test_benchmark_skips_incorrect_code(open_client):
    upstream = BenchmarkTransport(correctness=lambda parts: sorted(set(parts)))
    with open_client(upstream) as client:
        result = _benchmark(client).json()
    assert result["algorithm_status"] == "incorrect" and not result["correctness_passed"]
    assert result["correctness"]["cases"][3]["reason"] == "wrong_length"
    assert len(upstream.jobs) == 8
    assert all(item["status"] == "not_run" and item["median_ms"] is None for item in result["measurements"])


def test_benchmark_reports_partial_samples_and_skips_larger_inputs(open_client):
    upstream = BenchmarkTransport(measure=lambda parts: (
        {"status_id": 3, "stdout": _encode('{"python_version":"3.11.2","outcome":"case_time_limit","samples":[1,2]}')}
        if parts == sorting_benchmark.benchmark_input(100, "random") else BenchmarkTransport.completed(parts)
    ))
    with open_client(upstream) as client:
        result = _benchmark(client).json()
    assert result["algorithm_status"] == "time_limit"
    first = result["measurements"][0]
    assert (first["successful_runs"], first["status"], first["median_ms"]) == (2, "time_limit", None)
    assert result["measurements"][4]["error_message"] == "larger_case_skipped"
    assert result["measurements"][2]["status"] == "completed"
    assert len(upstream.jobs) == 18


def test_benchmark_invalidates_scores_if_a_later_measurement_is_wrong(open_client):
    upstream = BenchmarkTransport(measure=lambda parts: (
        {"status_id": 3, "stdout": _encode('{"python_version":"3.11.2","outcome":"wrong_output","samples":[1]}')}
        if len(set(parts)) <= 8 else BenchmarkTransport.completed(parts)
    ))
    with open_client(upstream) as client:
        result = _benchmark(client).json()
    assert result["correctness_passed"] and result["algorithm_status"] == "incorrect"
    assert result["measurements"][3]["error_message"] == "wrong_output"
    assert len(upstream.jobs) == 12
    assert all(item["median_ms"] is None for item in result["measurements"])


@pytest.mark.parametrize(("execution", "status", "algorithm_status", "http_status"), [
    ({"status_id": 5, "time": "2.001"}, "time_limit", "time_limit", 200),
    (None, "unavailable", "unavailable", 503),
])
def test_benchmark_reports_hard_timeout_or_outage(open_client, execution, status, algorithm_status, http_status):
    upstream = BenchmarkTransport(measure=lambda _: execution)
    with open_client(upstream) as client:
        response = _benchmark(client)
    assert response.status_code == http_status
    result = response.json()
    assert result["algorithm_status"] == algorithm_status
    assert result["measurements"][0]["status"] == status
    assert result["measurements"][0]["median_ms"] is None


def test_benchmark_uses_same_auth_and_production_gate(open_client, monkeypatch):
    with open_client(BenchmarkTransport()) as client:
        assert _benchmark(client, headers={}).status_code == 401
        assert _benchmark(client, headers={**_AUTH, "Forwarded": "for=127.0.0.1"}).status_code == 404
        assert _BENCHMARK_PATH not in client.get("/openapi.json").json()["paths"]
    monkeypatch.setenv("APP_ENV", "production")
    with open_client(BenchmarkTransport()) as client:
        assert _benchmark(client).status_code == 404


def test_benchmark_holds_the_shared_slot_during_measurement(open_client):
    started, finish = Event(), Event()
    upstream = BenchmarkTransport()

    async def hold_first_measurement(request):
        if request.method == "POST" and len(upstream.jobs) == 8:
            started.set()
            assert await asyncio.to_thread(finish.wait, 5)
        return upstream(request)

    with open_client(hold_first_measurement) as client, ThreadPoolExecutor(max_workers=1) as pool:
        request = pool.submit(_benchmark, client)
        try:
            assert started.wait(5)
            for response in (_benchmark(client), _judge_sorting(client), _execute(client)):
                assert response.status_code == 429
                assert response.json() == {"detail": "judge0_busy"}
        finally:
            finish.set()
        assert request.result(timeout=5).json()["algorithm_status"] == "completed"
    assert len(upstream.jobs) == 20


class SortingTransport:
    def __init__(self, result):
        self.result = result
        self.submissions = []

    def __call__(self, request):
        if request.method == "POST":
            payload = json.loads(request.content)
            assert request.url.params["wait"] == "false"
            assert request.url.params["base64_encoded"] == "true"
            assert payload["cpu_time_limit"] == 2
            assert payload["wall_time_limit"] == 5
            assert payload["memory_limit"] == 128_000
            assert payload["enable_network"] is False
            assert "expected_output" not in payload
            assert b64decode(payload["source_code"]).decode() == sorting_judge._PYTHON_HARNESS
            stdin = json.loads(b64decode(payload["stdin"]))
            assert set(stdin) == {"parts", "source_code"}
            self.submissions.append(stdin)
        polls = ()
        if request.url.path.endswith(_SUBMISSION_TOKEN):
            polls = (self.result(self.submissions[-1]["parts"], len(self.submissions)),)
        return _submission_flow(request, iter(polls))


def test_sorting_correct_output_and_fixed_submission_budget(open_client):
    upstream = SortingTransport(lambda parts, _: _sorting_result(sorted(parts)))
    with open_client(upstream) as client:
        first = _judge_sorting(client)
        second = _judge_sorting(client)

    assert first.status_code == second.status_code == 200
    assert first.headers["Cache-Control"] == "no-store"
    assert first.json() == second.json() == {
        "status": "passed",
        "passed_cases": 8,
        "total_cases": 8,
        "cases": [{"name": name, "passed": True, "reason": None} for name in _CASE_NAMES],
    }
    assert len(upstream.submissions) == 16
    assert upstream.submissions[:8] == upstream.submissions[8:]
    assert all(submission["source_code"] == _SORTING_SOURCE for submission in upstream.submissions)
    random, reverse, sorted_case, duplicates, equal, single, empty, signed = (
        submission["parts"] for submission in upstream.submissions[:8]
    )
    assert len(random) == len(reverse) == len(sorted_case) == len(duplicates) == 16
    assert random != sorted(random) and reverse == sorted(random, reverse=True) and sorted_case == sorted(random)
    assert len(set(duplicates)) < len(duplicates)
    assert len(equal) == 8 and len(set(equal)) == len(single) == 1 and empty == []
    assert min(signed) < 0 and 0 in signed


def test_sorting_reverse_order_fails_but_keeps_other_results(open_client):
    upstream = SortingTransport(lambda parts, _: _sorting_result(sorted(parts, reverse=True)))
    with open_client(upstream) as client:
        response = _judge_sorting(client)

    assert response.status_code == 200
    assert response.json()["status"] == "failed"
    assert response.json()["passed_cases"] == 3
    assert [case["reason"] for case in response.json()["cases"]] == [
        "wrong_order", "wrong_order", "wrong_order", "wrong_order", None, None, None, "wrong_order",
    ]


@pytest.mark.parametrize(
    ("change", "reason"),
    [
        (lambda parts: sorted(set(parts)), "wrong_length"),
        (lambda parts: sorted(parts)[1:], "wrong_length"),
        (lambda parts: sorted(parts) + [0], "wrong_length"),
        (lambda parts: [*sorted(parts)[:-1], 999], "wrong_elements"),
        (lambda parts: "sorted", "invalid_return"),
        (lambda parts: [False, *sorted(parts)[1:]], "invalid_return"),
        (lambda parts: [0.0, *sorted(parts)[1:]], "invalid_return"),
    ],
)
def test_sorting_validates_partial_failure_including_duplicates(open_client, change, reason):
    upstream = SortingTransport(lambda parts, index: _sorting_result(change(parts) if index == 4 else sorted(parts)))
    with open_client(upstream) as client:
        response = _judge_sorting(client)

    assert response.status_code == 200
    result = response.json()
    assert result["status"] == "failed"
    assert result["passed_cases"] == 7
    assert result["cases"][3] == {"name": "duplicates", "passed": False, "reason": reason}
    assert result["cases"][7]["passed"]


@pytest.mark.parametrize(
    ("execution", "reason"),
    [
        ({"status_id": 3, "stdout": _encode('{"kind":"invalid_return"}')}, "invalid_return"),
        ({"status_id": 3, "stdout": _encode('{"kind":"python_exception"}')}, "python_exception"),
        ({"status_id": 11, "stderr": _encode("private traceback")}, "python_exception"),
        ({"status_id": 3, "stdout": _encode('{"status":"passed"}')}, "invalid_output"),
        ({"status_id": 3, "stdout": _encode('{"kind":"result","values":[]}\n{}')}, "invalid_output"),
        ({"status_id": 3}, "invalid_output"),
    ],
)
def test_sorting_rejects_unverified_output(open_client, execution, reason):
    upstream = SortingTransport(lambda parts, index: execution if index == 1 else _sorting_result(sorted(parts)))
    with open_client(upstream) as client:
        response = _judge_sorting(client)

    assert response.status_code == 200
    assert response.json()["cases"][0]["reason"] == reason
    assert response.json()["passed_cases"] == 7
    assert "private traceback" not in response.text


@pytest.mark.parametrize(
    ("failure", "reason", "status", "http_status"),
    [
        ({"status_id": 5}, "time_limit_exceeded", "failed", 200),
        ({"status_id": 3, "stdout": _encode('{"kind":"memory_limit_exceeded"}')}, "memory_limit_exceeded", "failed", 200),
        ({"status_id": 13}, "judge_unavailable", "unavailable", 503),
        (httpx2.ConnectError("private Tailscale address"), "judge_unavailable", "unavailable", 503),
        (httpx2.ReadTimeout("private Tailscale address"), "judge_timeout", "unavailable", 503),
    ],
)
def test_sorting_stops_safely_and_preserves_partial_results(open_client, failure, reason, status, http_status):
    def mock_result(parts, index):
        if index == 1:
            return _sorting_result(sorted(parts))
        if isinstance(failure, Exception):
            raise failure
        return failure

    upstream = SortingTransport(mock_result)
    with open_client(upstream) as client:
        response = _judge_sorting(client)

    assert response.status_code == http_status
    result = response.json()
    assert result["status"] == status
    assert result["passed_cases"] == 1
    assert [case["reason"] for case in result["cases"]] == [None, reason, *(["not_run"] * 6)]
    assert len(upstream.submissions) == 2
    assert "private Tailscale address" not in response.text


def test_sorting_total_deadline_cancels_without_submitting_remaining_cases(open_client, monkeypatch):
    monkeypatch.setattr(sorting_judge, "_MAX_JUDGE_SECONDS", 0.5)
    upstream = SortingTransport(lambda parts, _: _sorting_result(sorted(parts)))

    async def stalled_poll(request):
        if len(upstream.submissions) == 2 and request.url.path.endswith(_SUBMISSION_TOKEN):
            await asyncio.sleep(5)
        return upstream(request)

    with open_client(stalled_poll) as client:
        response = _judge_sorting(client)

    assert response.status_code == 503
    assert response.json()["passed_cases"] == 1
    assert [case["reason"] for case in response.json()["cases"]] == [None, "judge_timeout", *(["not_run"] * 6)]
    assert len(upstream.submissions) == 2


def test_sorting_holds_the_shared_execution_slot_for_the_entire_suite(open_client):
    waiting = Event()
    finish = Event()
    upstream = SortingTransport(lambda parts, _: _sorting_result(sorted(parts)))

    async def second_submission(request):
        if len(upstream.submissions) == 1 and request.method == "POST":
            waiting.set()
            assert await asyncio.to_thread(finish.wait, 2)
        return upstream(request)

    with open_client(second_submission) as client, ThreadPoolExecutor(max_workers=1) as pool:
        first = pool.submit(_judge_sorting, client)
        try:
            assert waiting.wait(2)
            for response in (_judge_sorting(client), _execute(client)):
                assert response.status_code == 429
                assert response.json() == {"detail": "judge0_busy"}
        finally:
            finish.set()
        assert first.result(timeout=2).json()["passed_cases"] == 8


def test_sorting_shares_local_auth_and_input_restrictions(open_client):
    with open_client(_unexpected_request) as client:
        assert _judge_sorting(client, headers={}).status_code == 401
        assert _judge_sorting(client, source="a" * (MAX_SOURCE_CHARACTERS + 1)).status_code == 413
        response = client.post(_SORTING_PATH, headers=_AUTH, json={"source_code": _SORTING_SOURCE, "cases": []})
        assert response.status_code == 422
    with open_client(_unexpected_request, address="192.0.2.1") as client:
        assert _judge_sorting(client).status_code == 404


@pytest.mark.parametrize("environment", ["production", "test"])
def test_sorting_disabled_outside_development(configured, monkeypatch, environment):
    monkeypatch.setenv("APP_ENV", environment)
    monkeypatch.setattr(httpx2, "AsyncClient", _unexpected_request)
    with TestClient(app, base_url="http://localhost", client=("127.0.0.1", 50000)) as client:
        assert _judge_sorting(client).status_code == 404
        assert _SORTING_PATH not in client.get("/openapi.json").json()["paths"]


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        (
            'print("user output")\ndef sort_parts(a):\n    a.sort()\n    return a',
            {"kind": "result", "values": [-1, 0, 2, 2]},
        ),
        ("print('passed')", {"kind": "invalid_return"}),
        ("def sort_parts(a): return tuple(sorted(a))", {"kind": "invalid_return"}),
        ("def sort_parts(a): return [False]", {"kind": "invalid_return"}),
        ("def sort_parts(a): raise ValueError('private traceback')", {"kind": "python_exception"}),
        ("def sort_parts(a): raise MemoryError()", {"kind": "memory_limit_exceeded"}),
    ],
)
def test_sorting_harness_protocol_with_trusted_fixture_source(source, expected):
    result = run(
        [executable, "-I", "-c", sorting_judge._PYTHON_HARNESS],
        input=json.dumps({"source_code": source, "parts": [2, 0, 2, -1]}),
        text=True,
        capture_output=True,
        check=True,
        timeout=5,
    )
    assert json.loads(result.stdout) == expected
    assert result.stderr == ""
