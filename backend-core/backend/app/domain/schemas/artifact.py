from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class GenerateRequest(BaseModel):
    artifact_type: str = Field(min_length=1, max_length=80)
    requirement_text: str = Field(min_length=1, max_length=100000)
    requirement_id: str | None = Field(default=None, max_length=36)

    @field_validator("requirement_text")
    @classmethod
    def requirement_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Requirement text cannot be blank")
        return value.strip()


class ArtifactUpdate(BaseModel):
    expected_version: int | None = Field(default=None, ge=1)
    title: str | None = Field(default=None, max_length=255)
    content: dict[str, Any] | None = None
    status: str | None = Field(default=None, pattern="^(backlog|todo|in_progress|in_review|blocked|done)$")
    priority: str | None = Field(default=None, pattern="^(low|medium|high|critical)$")
    category: str | None = Field(default=None, max_length=100)
    assigned_to: str | None = Field(default=None, max_length=36)
    parent_artifact_ids: list[str] | None = Field(default=None, max_length=100)
    sort_order: int | None = Field(default=None, ge=0)


class ArtifactOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    created_by: str
    artifact_type: str
    title: str
    content: dict[str, Any]
    status: str = "backlog"
    priority: str = "medium"
    category: str | None = None
    assigned_to: str | None = None
    parent_artifact_ids: list[str] = Field(default_factory=list)
    sort_order: int = 0
    version: int
    created_at: datetime
    updated_at: datetime
