"""Admin provisioning stays idempotent and never persists plaintext passwords."""

import json

import pytest
from sqlalchemy.orm import sessionmaker

from app.core.security import hash_password, verify_password
from app.domain.models import User
from app.services import admin_bootstrap


def test_bootstrap_admins_create_six_and_promote_existing_user(db_session, monkeypatch):
    monkeypatch.setattr(admin_bootstrap, "SessionLocal", sessionmaker(bind=db_session.get_bind()))
    accounts = [
        {"email": "sayali@sprintsmith.local", "full_name": "Sayali", "password": "test-sayali-pass"},
        {"email": "raj@sprintsmith.local", "full_name": "Raj", "password": "test-raj-password"},
        {"email": "srushti@sprintsmith.local", "full_name": "Srushti", "password": "test-srushti-pass"},
        {"email": "rasika@sprintsmith.local", "full_name": "Rasika", "password": "test-rasika-pass"},
        {"email": "prathamesh@sprintsmith.local", "full_name": "Prathamesh", "password": "test-prathamesh-pass"},
        {"email": "devansh@sprintsmith.local", "full_name": "Devansh", "password": "test-devansh-pass"},
    ]
    db_session.add(User(
        id="existing-sayali", email="sayali@sprintsmith.local", full_name="Old name",
        password_hash=hash_password("old-password"), role="member", is_active=False,
    ))
    db_session.commit()
    monkeypatch.setattr(admin_bootstrap.settings, "bootstrap_admin_accounts_json", json.dumps(accounts))

    admin_bootstrap.ensure_bootstrap_admins()
    db_session.expire_all()
    admins = db_session.query(User).filter(User.role == "admin").all()
    assert len(admins) == 6
    sayali = db_session.query(User).filter_by(email="sayali@sprintsmith.local").one()
    assert sayali.full_name == "Sayali"
    assert sayali.is_active is True
    assert sayali.password_hash != accounts[0]["password"]
    assert verify_password(accounts[0]["password"], sayali.password_hash)

    admin_bootstrap.ensure_bootstrap_admins()
    db_session.expire_all()
    assert db_session.query(User).filter_by(email="sayali@sprintsmith.local").count() == 1


def test_empty_bootstrap_setting_is_a_no_op(monkeypatch):
    monkeypatch.setattr(admin_bootstrap.settings, "bootstrap_admin_accounts_json", " ")
    monkeypatch.setattr(admin_bootstrap, "SessionLocal", lambda: pytest.fail("opened database"))
    admin_bootstrap.ensure_bootstrap_admins()


@pytest.mark.parametrize("raw", [
    "not-json",
    "{}",
    '[{"email":"bad-email","full_name":"Bad","password":"long-enough-password"}]',
    '[{"email":"a@example.com","full_name":"A","password":"short"}]',
    '[{"email":"a@example.com","full_name":"A","password":"long-enough-password"},'
    '{"email":"a@example.com","full_name":"B","password":"long-enough-password"}]',
])
def test_bootstrap_rejects_invalid_configuration(raw, monkeypatch):
    monkeypatch.setattr(admin_bootstrap.settings, "bootstrap_admin_accounts_json", raw)
    with pytest.raises(ValueError):
        admin_bootstrap.ensure_bootstrap_admins()
