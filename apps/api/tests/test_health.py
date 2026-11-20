import pytest
from fastapi.testclient import TestClient

from app.main import app


def test_health():
    with TestClient(app) as client:
        response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "brain-forge-api"}


@pytest.mark.parametrize("origin", ["http://localhost:5173", "http://127.0.0.1:5173"])
def test_vite_origin(origin):
    with TestClient(app) as client:
        response = client.get("/api/v1/health", headers={"Origin": origin})
    assert response.headers["access-control-allow-origin"] == origin


def test_unlisted_origin():
    with TestClient(app) as client:
        response = client.options(
            "/api/v1/health",
            headers={"Origin": "https://example.org", "Access-Control-Request-Method": "GET"},
        )
    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers
