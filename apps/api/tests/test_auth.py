import json
from io import BytesIO
from urllib.error import HTTPError, URLError
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.core import auth


def test_auth_uses_supabase_to_verify_bearer_and_get_owner(monkeypatch):
    user_id = uuid4()

    def verified_user(request, *, timeout):
        assert request.full_url == "https://brain-forge.example/auth/v1/user"
        headers = {key.lower(): value for key, value in request.header_items()}
        assert headers["apikey"] == "publishable-key"
        assert headers["authorization"] == "Bearer player-token"
        assert timeout == 5
        return BytesIO(json.dumps({"id": str(user_id), "role": "authenticated", "is_anonymous": True}).encode())

    monkeypatch.setattr(auth, "urlopen", verified_user)
    assert auth.SupabaseAuth("https://brain-forge.example/", "publishable-key").user_id("player-token") == user_id


@pytest.mark.parametrize(
    ("upstream_error", "status"),
    [(401, 401), (403, 401), (429, 503), (500, 503), (None, 503)],
)
def test_auth_rejects_unverified_requests_and_handles_service_failures(monkeypatch, upstream_error, status):
    def failed_request(request, **_kwargs):
        if upstream_error is None:
            raise URLError("unreachable")
        raise HTTPError(request.full_url, upstream_error, "error", {}, BytesIO())

    monkeypatch.setattr(auth, "urlopen", failed_request)
    with pytest.raises(HTTPException) as error:
        auth.SupabaseAuth("https://brain-forge.example", "publishable-key").user_id("player-token")
    assert error.value.status_code == status
