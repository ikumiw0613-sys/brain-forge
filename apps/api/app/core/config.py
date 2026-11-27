import re
from typing import Literal

from pydantic import AnyHttpUrl, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[2]

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(
            API_ROOT / ".env",
            API_ROOT / ".env.local",
        ),
        env_file_encoding="utf-8",
        env_ignore_empty=True,
        hide_input_in_errors=True,
    )

    supabase_url: AnyHttpUrl | None = None
    supabase_publishable_key: SecretStr | None = None
    supabase_db_url: SecretStr | None = None
    # Retained for existing starter environment files.
    supabase_secret_key: SecretStr | None = None

    app_env: Literal["development", "test", "production"] = "production"
    judge0_dev_enabled: bool = False
    judge0_dev_token: SecretStr | None = None
    judge0_base_url: AnyHttpUrl | None = None
    judge0_auth_token: SecretStr | None = None
    judge0_python_language_id: int | None = Field(default=None, gt=0)
    judge0_request_timeout: float = Field(default=3, gt=0, le=30)
    judge0_max_poll_seconds: float = Field(default=15, gt=0, le=60)
    judge0_max_poll_attempts: int = Field(default=30, gt=0, le=120)

    @property
    def judge0_enabled(self) -> bool:
        return self.app_env == "development" and self.judge0_dev_enabled

    @field_validator("judge0_base_url")
    @classmethod
    def validate_judge0_url(cls, url: AnyHttpUrl | None) -> AnyHttpUrl | None:
        if url is not None and any(
            value is not None for value in (url.username, url.password, url.query, url.fragment)
        ):
            raise ValueError("Judge0 URL must omit credentials, a query, and a fragment")
        return url

    @field_validator("judge0_dev_token")
    @classmethod
    def validate_judge0_dev_token(cls, token: SecretStr | None) -> SecretStr | None:
        if token is not None and not re.fullmatch(r"[A-Za-z0-9_-]{32,128}", token.get_secret_value()):
            raise ValueError("Judge0 dev token must contain 32–128 URL-safe characters")
        return token

    @field_validator("judge0_auth_token")
    @classmethod
    def validate_judge0_auth_token(cls, token: SecretStr | None) -> SecretStr | None:
        if token is not None and not re.fullmatch(r"[!-~]+", token.get_secret_value()):
            raise ValueError("Judge0 authentication token must contain visible ASCII characters")
        return token

    @model_validator(mode="after")
    def validate_enabled_judge0(self) -> "Settings":
        if self.judge0_enabled and (
            self.judge0_base_url is None
            or self.judge0_python_language_id is None
            or self.judge0_dev_token is None
        ):
            raise ValueError("Judge0 development API requires a base URL, Python language ID, and dev token")
        return self
