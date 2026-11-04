"""
Tests for BaseRepository - the generic CRUD repository base class.

Verifies all base CRUD operations:
- new_id(), get(), add(), delete(), flush(), commit(), rollback(), refresh()
"""

import uuid
from app.domain.models import Project
from app.repositories.base import BaseRepository


def test_base_repository_new_id(db_session):
    """new_id() returns a valid UUID string."""
    repo = BaseRepository(db_session, Project)
    new_id = repo.new_id()
    assert isinstance(new_id, str)
    # Must be parseable as UUID
    uuid.UUID(new_id)


def test_base_repository_add_and_get(db_session):
    """Add an entity and retrieve it by ID."""
    repo = BaseRepository(db_session, Project)
    project_id = repo.new_id()
    project = Project(id=project_id, name="Test Project", owner_id="user-1")
    repo.add(project)
    repo.commit()

    retrieved = repo.get(project_id)
    assert retrieved is not None
    assert retrieved.id == project_id
    assert retrieved.name == "Test Project"


def test_base_repository_delete(db_session):
    """Delete an entity and confirm it is gone."""
    repo = BaseRepository(db_session, Project)
    project_id = repo.new_id()
    project = Project(id=project_id, name="To Delete", owner_id="user-1")
    repo.add(project)
    repo.commit()

    repo.delete(project)
    repo.commit()

    assert repo.get(project_id) is None


def test_base_repository_flush(db_session):
    """flush() persists to DB without ending the transaction."""
    repo = BaseRepository(db_session, Project)
    project = Project(id=repo.new_id(), name="Flush Test", owner_id="user-1")
    repo.add(project)
    repo.flush()  # Not committed yet

    # Should be retrievable within the same session
    retrieved = repo.get(project.id)
    assert retrieved is not None
    assert retrieved.name == "Flush Test"

    repo.rollback()  # Undo since we didn't commit


def test_base_repository_rollback(db_session):
    """rollback() discards uncommitted changes."""
    repo = BaseRepository(db_session, Project)
    project = Project(id=repo.new_id(), name="Rollback Test", owner_id="user-1")
    repo.add(project)
    repo.flush()

    retrieved = repo.get(project.id)
    assert retrieved is not None

    repo.rollback()

    # After rollback, the entity should not be in the DB
    assert repo.get(project.id) is None


def test_base_repository_refresh(db_session):
    """refresh() reloads entity state from the database."""
    repo = BaseRepository(db_session, Project)
    project_id = repo.new_id()
    project = Project(id=project_id, name="Original", owner_id="user-1")
    repo.add(project)
    repo.commit()

    # Modify in-memory only
    project.name = "Modified In Memory"

    # Refresh restores from DB
    repo.refresh(project)
    assert project.name == "Original"
