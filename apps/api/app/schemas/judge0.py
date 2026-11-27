from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

MAX_SOURCE_CHARACTERS = 10_000


class Judge0PythonRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    source_code: str = Field(min_length=1, max_length=MAX_SOURCE_CHARACTERS)


class Judge0Language(BaseModel):
    model_config = ConfigDict(strict=True)

    id: int = Field(gt=0)
    name: str = Field(min_length=1)


class Judge0HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    python_language_id: int
    languages: list[Judge0Language]


class Judge0ExecutionResult(BaseModel):
    stdout: str | None = None
    stderr: str | None = None
    compile_output: str | None = None
    message: str | None = None
    status_id: int
    status_description: str
    execution_time: float | None = Field(default=None, description="Judge0 CPU time in seconds.")
    memory_usage: int | None = Field(default=None, description="Judge0 memory usage in kilobytes (KB).")
