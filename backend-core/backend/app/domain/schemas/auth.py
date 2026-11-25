from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, validator, field_validator


class UserCreate(BaseModel):
    email: str = Field(min_length=5, max_length=160)
    full_name: str = Field(min_length=1, max_length=160)
    password: str = Field(min_length=8, max_length=128)
    role: str = Field(default="member")

    @validator("email")
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        """Allow .local domains for local development (mDNS reserved TLD)."""
        if "@" not in v:
            raise ValueError("Invalid email address: missing @")
        local_part, domain = v.rsplit("@", 1)
        # Allow .local for development (mDNS reserved TLD commonly used in local setups)
        if domain.endswith(".local"):
            return v
        # Standard email validation for other domains
        if "." not in domain:
            raise ValueError("Invalid email address: missing domain TLD")
        if len(local_part) > 64 or len(domain) > 255:
            raise ValueError("Invalid email address: local part or domain too long")
        return v

    @field_validator("full_name")
    @classmethod
    def name_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Full name cannot be blank")
        return value.strip()


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: EmailStr
    full_name: str
    role: str
    created_at: datetime


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=160)
    password: str

    @validator("email")
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        """Allow .local domains for local development (mDNS reserved TLD)."""
        if "@" not in v:
            raise ValueError("Invalid email address: missing @")
        local_part, domain = v.rsplit("@", 1)
        # Allow .local for development (mDNS reserved TLD commonly used in local setups)
        if domain.endswith(".local"):
            return v
        # Standard email validation for other domains
        if "." not in domain:
            raise ValueError("Invalid email address: missing domain TLD")
        if len(local_part) > 64 or len(domain) > 255:
            raise ValueError("Invalid email address: local part or domain too long")
        return v
