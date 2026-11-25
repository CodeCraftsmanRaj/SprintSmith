from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class RequirementUpdate(BaseModel):
    content: str | None = Field(default=None, min_length=1, max_length=200000)
    filename: str | None = Field(default=None, min_length=1, max_length=255)
    category: str | None = Field(default=None, max_length=100)
    tags: list[str] | None = Field(default=None, max_length=50)
    priority: Literal["low", "medium", "high", "critical"] | None = None
    expected_version: int | None = Field(default=None, ge=1)
    change_summary: str = Field(default="Requirement updated", max_length=500)

    @field_validator("content")
    @classmethod
    def content_not_blank(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("Requirement content cannot be blank")
        return value.strip() if value is not None else value

    @field_validator("filename", "category")
    @classmethod
    def trim_optional_text(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("Value cannot be blank")
        return value.strip() if value is not None else value

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, values: list[str] | None) -> list[str] | None:
        if values is None:
            return values
        result = list(dict.fromkeys(tag.strip() for tag in values if tag.strip()))
        if len(result) != len(values):
            raise ValueError("Tags must be non-blank and unique")
        if any(len(tag) > 50 for tag in result):
            raise ValueError("Tags must be at most 50 characters")
        return result


class RequirementReview(BaseModel):
    decision: Literal["approved", "rejected", "pending"]
    review_note: str = Field(default="", max_length=2000)
    expected_version: int | None = Field(default=None, ge=1)


class RequirementOut(BaseModel):
    id: str
    project_id: str
    filename: str
    doc_type: str
    content: str
    chunks_indexed: int
    category: str | None
    tags: list[str]
    priority: str
    review_status: str
    version: int
    index_stale: bool
    created_at: datetime
    updated_at: datetime


class RequirementVersionOut(BaseModel):
    id: str
    requirement_id: str
    version: int
    changed_by: str
    snapshot: dict
    change_summary: str
    created_at: datetime
