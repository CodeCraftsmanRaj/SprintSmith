"""
Unit tests for Pydantic schema validation.

Verifies:
- UserCreate: email formatting, blank name rejection, password length constraints
- ProjectCreate: blank name rejection, field lengths
- EvaluationCreate: score boundaries (1 to 5)
- TaskCreate / TaskUpdate: blank title rejection, null field rejection, range constraints
"""

import pytest
from pydantic import ValidationError
from app.domain.schemas import UserCreate, ProjectCreate, EvaluationCreate
from app.domain.schemas.task import TaskCreate, TaskUpdate


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


def test_evaluation_create_score_range():
    # Valid scores
    assert EvaluationCreate(score=1).score == 1
    assert EvaluationCreate(score=5).score == 5

    # Invalid scores
    with pytest.raises(ValidationError):
        EvaluationCreate(score=0)

    with pytest.raises(ValidationError):
        EvaluationCreate(score=6)


def test_task_create_valid():
    task = TaskCreate(title="Write tests", description="Cover the task schemas", priority="high", story_points=5)
    assert task.title == "Write tests"
    assert task.status == "todo"
    assert task.priority == "high"
    assert task.story_points == 5


def test_task_create_rejects_blank_title():
    with pytest.raises(ValidationError) as exc:
        TaskCreate(title="   ")
    assert "Task title cannot be blank" in str(exc.value)


def test_task_update_rejects_null_title():
    # mode="before" validator runs when the field is explicitly provided as None.
    with pytest.raises(ValidationError) as exc:
        TaskUpdate(title=None)
    assert "This field cannot be null" in str(exc.value)


def test_task_update_rejects_blank_title():
    with pytest.raises(ValidationError) as exc:
        TaskUpdate(title="   ")
    assert "Task title cannot be blank" in str(exc.value)


def test_task_update_rejects_out_of_range_story_points():
    with pytest.raises(ValidationError):
        TaskUpdate(story_points=-1)

    with pytest.raises(ValidationError):
        TaskUpdate(story_points=101)

    assert TaskUpdate(story_points=0).story_points == 0
    assert TaskUpdate(story_points=100).story_points == 100


def test_task_update_rejects_invalid_status_and_priority():
    with pytest.raises(ValidationError):
        TaskUpdate(status="not-a-status")

    with pytest.raises(ValidationError):
        TaskUpdate(priority="not-a-priority")
