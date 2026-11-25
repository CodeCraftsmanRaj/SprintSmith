from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class ProjectInvitationCreate(BaseModel):
    email: EmailStr
    role: Literal["admin", "editor", "viewer"] = "viewer"


class ProjectInvitationOut(BaseModel):
    id: str
    project_id: str
    email: EmailStr
    role: str
    status: str
    invited_by: str
    expires_at: datetime
    created_at: datetime


class ProjectMemberRoleUpdate(BaseModel):
    role: Literal["admin", "editor", "viewer"]


class InvitationAccept(BaseModel):
    token: str = Field(min_length=32, max_length=256)
