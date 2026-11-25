from typing import Any
import json

from pydantic import BaseModel, Field, field_validator


class EvaluationCreate(BaseModel):
    score: int = Field(ge=1, le=5)
    feedback: str = Field(default="", max_length=10000)
    metrics: dict[str, Any] = Field(default_factory=dict)


class EvaluationBaselineCreate(BaseModel):
    artifact_type: str = Field(min_length=1, max_length=80)
    title: str = Field(min_length=1, max_length=255)
    source_name: str = Field(default="", max_length=255)
    content: dict[str, Any]

    @field_validator("content")
    @classmethod
    def baseline_content_size(cls, value: dict[str, Any]) -> dict[str, Any]:
        if not value:
            raise ValueError("Baseline content must not be empty")
        if len(json.dumps(value, ensure_ascii=False).encode("utf-8")) > 1_000_000:
            raise ValueError("Baseline content must be 1 MB or smaller")
        return value
