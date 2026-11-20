import json
from typing import Annotated
from urllib.error import HTTPError, URLError
from urllib.request import Request as HttpRequest, urlopen
from uuid import UUID

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

_bearer = HTTPBearer(auto_error=False)


def _invalid_bearer() -> HTTPException:
    return HTTPException(401, "invalid_access_token", headers={"WWW-Authenticate": "Bearer"})


class SupabaseAuth:
    def __init__(self, supabase_url: str, publishable_key: str):
        self._user_url = f"{supabase_url.rstrip('/')}/auth/v1/user"
        self._publishable_key = publishable_key

    def user_id(self, access_token: str) -> UUID:
        request = HttpRequest(self._user_url, headers={"Accept": "application/json"})
        request.add_unredirected_header("apikey", self._publishable_key)
        request.add_unredirected_header("Authorization", f"Bearer {access_token}")

        try:
            with urlopen(request, timeout=5) as response:
                user = json.load(response)
        except HTTPError as error:
            error.close()
            if error.code in (400, 401, 403):
                raise _invalid_bearer() from None
            raise HTTPException(503, "auth_unavailable") from None
        except (URLError, OSError, ValueError):
            raise HTTPException(503, "auth_unavailable") from None

        if not isinstance(user, dict) or user.get("role") != "authenticated":
            raise _invalid_bearer()
        try:
            return UUID(user["id"])
        except (KeyError, TypeError, AttributeError, ValueError):
            raise HTTPException(503, "invalid_auth_response") from None


def get_authenticated_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> UUID:
    if credentials is None:
        raise _invalid_bearer()
    auth: SupabaseAuth | None = request.app.state.supabase_auth
    if auth is None:
        raise HTTPException(503, "auth_not_configured")
    return auth.user_id(credentials.credentials)


AuthenticatedUser = Annotated[UUID, Depends(get_authenticated_user)]
