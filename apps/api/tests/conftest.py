from contextlib import contextmanager
from copy import deepcopy
from threading import Lock
from uuid import UUID

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.services.attempts import AttemptError, AttemptErrorCode, AttemptService

_USERS = {
    "test-player": UUID("e525c178-579e-49f8-8cf8-899d196e1897"),
    "test-other-player": UUID("4d9e4ce7-1020-4089-91b0-260251ed9c87"),
}


class MemoryAttemptStore:
    def __init__(self):
        self._attempts = {}
        self._lock = Lock()

    def _read(self, user_id, attempt_id):
        attempt = self._attempts.get((user_id, attempt_id))
        if attempt is None:
            raise AttemptError(AttemptErrorCode.ATTEMPT_NOT_FOUND)
        return deepcopy(attempt)

    def insert(self, user_id, attempt):
        with self._lock:
            self._attempts[user_id, attempt.id] = deepcopy(attempt)

    def get(self, user_id, attempt_id):
        with self._lock:
            return self._read(user_id, attempt_id)

    @contextmanager
    def edit(self, user_id, attempt_id):
        with self._lock:
            attempt = self._read(user_id, attempt_id)
            yield attempt
            self._attempts[user_id, attempt_id] = attempt

    def progress(self, user_id):
        return ()


class TestAuth:
    def user_id(self, access_token):
        if access_token not in _USERS:
            raise HTTPException(401, "invalid_access_token")
        return _USERS[access_token]


@pytest.fixture
def game_client():
    @contextmanager
    def create_client(store=None):
        with TestClient(app, headers={"Authorization": "Bearer test-player"}) as client:
            app.state.supabase_auth = TestAuth()
            app.state.attempt_service = AttemptService(store if store is not None else MemoryAttemptStore())
            yield client

    return create_client


@pytest.fixture
def game_users():
    return _USERS.copy()
