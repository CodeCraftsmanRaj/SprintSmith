from datetime import datetime

from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=10000)

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Project name cannot be blank")
        return value.strip()


class ProjectOut(BaseModel):
    id: str
    name: str
    description: str
    owner_id: str
    created_at: datetime


class ProjectMonitoringDashboard(BaseModel):
    available: bool
    dashboard_url: str | None = None
    message: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=10000)


class ProjectInvitationCreate(BaseModel):
    email: EmailStr
    role: Literal["admin", "editor", "viewer"] = "viewer"


class ProjectInvitationAccept(BaseModel):
    token: str = Field(min_length=20, max_length=200)


class ProjectMemberRoleUpdate(BaseModel):
    role: Literal["admin", "editor", "viewer"]
