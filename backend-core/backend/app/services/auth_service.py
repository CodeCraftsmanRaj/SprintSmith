"""
Authentication & user-registration business logic.

Owns password hashing, token creation, and user-existence checks.
Raises domain exceptions – never touches FastAPI directly.
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from app.core.config import settings
from app.core.exceptions import AccountLockedError, AuthenticationError, ConflictError, ResourceNotFoundError
from app.core.security import create_access_token, hash_password, verify_password
from app.domain.models import User
from app.repositories.audit_repo import AuditRepository
from app.repositories.user_repo import UserRepository


class AuthService:
    def __init__(self, user_repo: UserRepository, audit_repo: AuditRepository):
        self.user_repo = user_repo
        self.audit_repo = audit_repo

    def register(self, email: str, full_name: str, password: str) -> User:
        email = email.lower()
        if self.user_repo.get_by_email(email):
            raise ConflictError("Email already registered")

        user = User(
            id=self.user_repo.new_id(),
            email=email,
            full_name=full_name.strip(),
            password_hash=hash_password(password),
            role="member",
        )
        self.user_repo.add(user)
        self.user_repo.flush()
        self.audit_repo.record(user.id, "user.register", "user", user.id)
        self.user_repo.commit()
        self.user_repo.refresh(user)
        return user

    def login(self, email: str, password: str) -> str:
        """Authenticate and return a JWT access token."""
        user = self.user_repo.get_by_email(email.lower())
        now = datetime.now(timezone.utc)
        if not user or not user.is_active:
            raise AuthenticationError("Incorrect email or password")

        if user.locked_until:
            locked_until = user.locked_until
            if locked_until.tzinfo is None:
                locked_until = locked_until.replace(tzinfo=timezone.utc)
            if locked_until > now:
                raise AccountLockedError()
            user.locked_until = None
            user.failed_login_attempts = 0

        if not verify_password(password, user.password_hash):
            user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
            details = {"failed_attempts": user.failed_login_attempts}
            if user.failed_login_attempts >= settings.login_max_failed_attempts:
                user.locked_until = now + timedelta(minutes=settings.login_lockout_minutes)
                details["locked_until"] = user.locked_until.isoformat()
                self.audit_repo.record(user.id, "auth.account_locked", "user", user.id, details)
                self.user_repo.commit()
                raise AccountLockedError()
            self.audit_repo.record(user.id, "auth.login_failed", "user", user.id, details)
            self.user_repo.commit()
            raise AuthenticationError("Incorrect email or password")

        user.failed_login_attempts = 0
        user.locked_until = None
        self.audit_repo.record(user.id, "auth.login", "user", user.id)
        self.user_repo.commit()
        return create_access_token(user.id)

    def admin_login(self, email: str, password: str) -> str:
        token = self.login(email, password)
        user = self.user_repo.get_by_email(email.lower())
        if not user or user.role.lower() != "admin":
            raise AuthenticationError("Administrator credentials are required")
        return token

    def create_user(self, *, email: str, full_name: str, password: str, role: str = "member",
                    created_by: str | None = None) -> User:
        normalized_email = email.strip().lower()
        if self.user_repo.get_by_email(normalized_email):
            raise ConflictError("Email already registered")
        user = User(id=self.user_repo.new_id(), email=normalized_email,
                    full_name=full_name.strip(), password_hash=hash_password(password),
                    role=role, is_active=True)
        self.user_repo.add(user)
        self.user_repo.flush()
        self.audit_repo.record(created_by, "user.create", "user", user.id,
                               {"email": normalized_email, "role": role})
        self.user_repo.commit()
        return self.user_repo.refresh(user)

    def issue_password_reset(self, user_id: str, issued_by: str | None = None) -> str:
        user = self.user_repo.get(user_id)
        if not user:
            raise ResourceNotFoundError("User", user_id)
        token = secrets.token_urlsafe(32)
        user.password_reset_token_hash = hashlib.sha256(token.encode()).hexdigest()
        user.password_reset_expires_at = datetime.now(timezone.utc) + timedelta(
            minutes=settings.password_reset_expire_minutes
        )
        self.audit_repo.record(issued_by, "user.password_reset_issued", "user", user.id)
        self.user_repo.commit()
        return token

    def reset_password(self, token: str, new_password: str) -> None:
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        user = self.user_repo.db.query(User).filter(User.password_reset_token_hash == token_hash).first()
        if not user or not user.password_reset_expires_at:
            raise AuthenticationError("Password reset token is invalid or expired")
        expires = user.password_reset_expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires <= datetime.now(timezone.utc):
            user.password_reset_token_hash = None
            user.password_reset_expires_at = None
            self.user_repo.commit()
            raise AuthenticationError("Password reset token is invalid or expired")
        user.password_hash = hash_password(new_password)
        user.password_reset_token_hash = None
        user.password_reset_expires_at = None
        user.failed_login_attempts = 0
        user.locked_until = None
        self.audit_repo.record(user.id, "user.password_reset", "user", user.id)
        self.user_repo.commit()

    def update_user(self, user_id: str, updates: dict, updated_by: str | None = None) -> User:
        user = self.user_repo.get(user_id)
        if not user:
            raise ResourceNotFoundError("User", user_id)
        for key, value in updates.items():
            if value is not None:
                setattr(user, key, value.strip() if key == "full_name" else value)
        self.audit_repo.record(updated_by, "user.update", "user", user.id,
                               {"fields": sorted(updates)})
        self.user_repo.commit()
        return self.user_repo.refresh(user)
