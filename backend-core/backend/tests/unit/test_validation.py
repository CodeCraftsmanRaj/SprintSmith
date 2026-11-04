"""
Unit tests for Pydantic schema validation.

Verifies:
- UserCreate: email formatting, blank name rejection, password length constraints
- ProjectCreate: blank name rejection, field lengths
- EvaluationCreate: score boundaries (1 to 5)
"""

import pytest
from pydantic import ValidationError
from app.domain.schemas import (
    EvaluationCreate,
    ProjectCreate,
    ProjectMonitoringDashboard,
    ProjectOut,
    ProjectUpdate,
    UserCreate,
)
from app.core.config import Settings


def test_user_create_valid():
    user = UserCreate(email="test@barclays.com", full_name="Jane Doe", password="password123")
    assert user.email == "test@barclays.com"
    assert user.full_name == "Jane Doe"


def test_user_create_rejects_invalid_email():
    with pytest.raises(ValidationError):
        UserCreate(email="not-an-email", full_name="Jane", password="password123")


def test_user_create_rejects_blank_name():
    with pytest.raises(ValidationError) as exc:
        UserCreate(email="valid@example.com", full_name="   ", password="password123")
    assert "cannot be blank" in str(exc.value)


def test_user_create_rejects_short_password():
    with pytest.raises(ValidationError):
        UserCreate(email="valid@example.com", full_name="Jane", password="short")


def test_project_create_rejects_blank_name():
    with pytest.raises(ValidationError) as exc:
        ProjectCreate(name="   ", description="Some desc")
    assert "cannot be blank" in str(exc.value)


def test_project_create_trims_name_and_defaults_description():
    project = ProjectCreate(name="  Payments  ")

    assert project.name == "Payments"
    assert project.description == ""


def test_project_update_supports_partial_changes_and_validates_name():
    update = ProjectUpdate(description="Updated description")

    assert update.model_dump(exclude_unset=True) == {"description": "Updated description"}
    with pytest.raises(ValidationError):
        ProjectUpdate(name="")


def test_project_response_schemas_serialize_optional_monitoring_fields():
    project = ProjectOut(
        id="project-1",
        name="Payments",
        description="",
        owner_id="user-1",
        created_at="2026-10-01T00:00:00Z",
    )
    dashboard = ProjectMonitoringDashboard(available=False)

    assert project.model_dump()["owner_id"] == "user-1"
    assert dashboard.model_dump() == {
        "available": False,
        "dashboard_url": None,
        "message": None,
    }


def test_settings_allowed_origins_trims_and_discards_empty_entries():
    settings = Settings(cors_origins=" https://one.example, ,https://two.example ,, ")

    assert settings.allowed_origins == [
        "https://one.example",
        "https://two.example",
    ]


def test_evaluation_create_score_range():
    # Valid scores
    assert EvaluationCreate(score=1).score == 1
    assert EvaluationCreate(score=5).score == 5

    # Invalid scores
    with pytest.raises(ValidationError):
        EvaluationCreate(score=0)

    with pytest.raises(ValidationError):
        EvaluationCreate(score=6)
