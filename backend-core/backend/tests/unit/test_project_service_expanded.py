"""
Unit tests for services/project_service.py.

Verifies:
- create() creates a project
- get_project_or_fail() returns project or raises
"""

import pytest
from app.services.project_service import ProjectService
from app.core.exceptions import ResourceNotFoundError


def test_project_service_create(project_service, dev_user):
    """create() creates a new project."""
    project = project_service.create("Test Project", "A test project", dev_user)
    assert project.id is not None
    assert project.name == "Test Project"
    assert project.description == "A test project"
    assert project.owner_id == dev_user.id


def test_project_service_get_project_or_fail(project_service, dev_user):
    """get_project_or_fail() returns existing project."""
    project = project_service.create("Find Me", "desc", dev_user)
    found = project_service.get_project_or_fail(project.id, dev_user)
    assert found.id == project.id


def test_project_service_get_project_or_fail_not_found(project_service, dev_user):
    """get_project_or_fail() raises ResourceNotFoundError for missing project."""
    with pytest.raises(ResourceNotFoundError):
        project_service.get_project_or_fail("nonexistent", dev_user)
