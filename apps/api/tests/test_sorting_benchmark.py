import json
from os import getenv
from subprocess import run
from sys import executable

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import app
from app.services import sorting_benchmark

_BUBBLE = """\
def sort_parts(a):
    for end in range(len(a) - 1, 0, -1):
        swapped = False
        for i in range(end):
            if a[i] > a[i + 1]:
                a[i], a[i + 1] = a[i + 1], a[i]
                swapped = True
        if not swapped:
            break
    return a
"""

_MERGE = """\
def sort_parts(a):
    if len(a) < 2:
        return a
    middle = len(a) // 2
    left, right = sort_parts(a[:middle]), sort_parts(a[middle:])
    result = []
    i = j = 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            result.append(left[i])
            i += 1
        else:
            result.append(right[j])
            j += 1
    return result + left[i:] + right[j:]
"""

_ALGORITHMS = {"bubble": _BUBBLE, "merge": _MERGE}


def _run_harness(source, parts):
    result = run(
        [executable, "-I", "-c", sorting_benchmark._HARNESS],
        input=json.dumps({"source_code": source, "parts": parts, "runs": 5}),
        capture_output=True, text=True, check=True, timeout=5,
    )
    return json.loads(result.stdout)


@pytest.mark.parametrize("algorithm", _ALGORITHMS)
def test_harness_measures_trusted_sorts(algorithm):
    for distribution in ("random", "reverse", "sorted", "duplicates"):
        report = _run_harness(_ALGORITHMS[algorithm], sorting_benchmark.benchmark_input(100, distribution))
        assert report["outcome"] == "completed"
        assert len(report["samples"]) == 5 and min(report["samples"]) >= 0


def test_fixed_seed_order_and_duplicates():
    random = sorting_benchmark.benchmark_input(100, "random")
    assert random[:3] == [639426, 25010, 275029]
    assert random == sorting_benchmark.benchmark_input(100, "random")
    assert random == sorting_benchmark.benchmark_input(1000, "random")[:100]
    assert sorting_benchmark.benchmark_input(100, "sorted") == sorted(random)
    assert sorting_benchmark.benchmark_input(100, "reverse") == sorted(random, reverse=True)
    assert len(set(sorting_benchmark.benchmark_input(100, "duplicates"))) == 8


@pytest.mark.parametrize(("source", "outcome"), [
    ("def sort_parts(a): return sorted(set(a))", "wrong_output"),
    ("def sort_parts(a): return sorted(a, reverse=True)", "wrong_output"),
    ("def sort_parts(a): return [False, 1, 1]", "invalid_return"),
    ("def sort_parts(a):\n    a.sort()\n    return a", "completed"),
])
def test_harness_validates_each_fresh_input(source, outcome):
    report = _run_harness(source, [1, 0, 1])
    assert report["outcome"] == outcome
    assert len(report["samples"]) == (5 if outcome == "completed" else 0)


@pytest.mark.skipif(getenv("BRAIN_FORGE_RUN_JUDGE0_E2E") != "1", reason="Uses the configured Judge0 instance")
@pytest.mark.parametrize("name", _ALGORITHMS)
def test_live_benchmark_at_100_elements(monkeypatch, name):
    monkeypatch.setattr(sorting_benchmark, "_SIZES", (100,))
    settings = Settings()
    assert settings.judge0_enabled and settings.judge0_dev_token is not None
    headers = {"Authorization": f"Bearer {settings.judge0_dev_token.get_secret_value()}"}
    with TestClient(app, base_url="http://127.0.0.1:8000", client=("127.0.0.1", 50000), headers=headers) as client:
        health = client.get("/api/v1/dev/judge0/health")
        assert health.status_code == 200, health.json().get("detail")
        response = client.post("/api/v1/dev/judge0/sorting/benchmark", json={"source_code": _ALGORITHMS[name]})
        result = response.json()
        assert response.status_code == 200 and result["algorithm_status"] == "completed", result
        print(name, result["python_version"], result["judge0_language_id"], {
            item["distribution"]: (item["median_ms"], item["min_ms"], item["max_ms"])
            for item in result["measurements"]
        })
