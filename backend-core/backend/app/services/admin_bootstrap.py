"""Create configured platform admins without storing bootstrap passwords in code."""

import json
import logging
import uuid

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.domain.models import User
from app.repositories.user_repo import UserRepository

logger = logging.getLogger("sprintsmith.backend.admin_bootstrap")


def ensure_bootstrap_admins() -> None:
    """Idempotently provision admin accounts from server-only JSON settings."""
    raw_accounts = settings.bootstrap_admin_accounts_json.strip()
    if not raw_accounts:
        return

    try:
        accounts = json.loads(raw_accounts)
    except json.JSONDecodeError as exc:
        raise ValueError("BOOTSTRAP_ADMIN_ACCOUNTS_JSON must contain a JSON array") from exc
    if not isinstance(accounts, list):
        raise ValueError("BOOTSTRAP_ADMIN_ACCOUNTS_JSON must contain a JSON array")

    normalized = []
    seen_emails = set()
    for account in accounts:
        if not isinstance(account, dict):
            raise ValueError("Each bootstrap admin must be an object")
        email = str(account.get("email", "")).strip().lower()
        full_name = str(account.get("full_name", "")).strip()
        password = account.get("password")
        if not email or "@" not in email or not full_name or not isinstance(password, str) or len(password) < 7:
            raise ValueError("Each bootstrap admin needs a valid email, name, and password of at least 7 characters")
        if email in seen_emails:
            raise ValueError("Bootstrap admin emails must be unique")
        seen_emails.add(email)
        normalized.append((email, full_name, password))

    db = SessionLocal()
    try:
        users = UserRepository(db)
        for email, full_name, password in normalized:
            user = users.get_by_email(email)
            password_hash = hash_password(password)
            if user:
                user.full_name = full_name
                user.role = "admin"
                user.password_hash = password_hash
                user.is_active = True
            else:
                users.add(User(
                    id=str(uuid.uuid4()),
                    email=email,
                    full_name=full_name,
                    password_hash=password_hash,
                    role="admin",
                    is_active=True,
                ))
        db.commit()
        logger.info("Ensured %s configured platform admin account(s)", len(normalized))
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
