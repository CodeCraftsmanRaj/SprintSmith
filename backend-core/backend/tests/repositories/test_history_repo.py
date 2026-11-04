"""
Repository tests for GenerationHistoryRepository.

Verifies:
- Listing generation history for a project (newest first)
- Chronological listing (oldest first)
- Getting history for a specific artifact
- Stats computation (total, by_type, avg_eval_score)
- Empty project returns zero stats
- CRUD operations via BaseRepository
"""

from app.domain.models import Artifact, GenerationHistory, Project
from app.repositories.history_repo import GenerationHistoryRepository


def test_history_repo_list_for_project(db_session, history_repo, project_repo, dev_user, artifact_repo):
    """Generation history entries are returned for a project, newest first."""
    project = Project(id=project_repo.new_id(), name="Test Project", owner_id=dev_user.id)
    project_repo.add(project)
    project_repo.commit()

    artifact = Artifact(
        id=artifact_repo.new_id(), project_id=project.id, created_by=dev_user.id,
        artifact_type="user_story", title="Test Artifact", content={"key": "value"}, version=1,
    )
    artifact_repo.add(artifact)
    artifact_repo.commit()

    user_id = dev_user.id

    h1 = GenerationHistory(
        id=history_repo.new_id(), project_id=project.id, artifact_id=artifact.id, user_id=user_id,
        engine_request_id="er-1", artifact_type="user_story",
        prompt_version="v1", usage={}, latency_ms=100,
        requirement_text="req text", eval_score=0.9, retry_count=0,
        model_used="model-x",
    )
    h2 = GenerationHistory(
        id=history_repo.new_id(), project_id=project.id, artifact_id=artifact.id, user_id=user_id,
        engine_request_id="er-2", artifact_type="task",
        prompt_version="v2", usage={}, latency_ms=200,
        requirement_text="req text 2", eval_score=0.7, retry_count=1,
        model_used="model-y",
    )
    history_repo.add(h1)
    history_repo.add(h2)
    history_repo.commit()

    results = history_repo.list_for_project(project.id)
    assert len(results) == 2
    assert results[0].id == h2.id
    assert results[1].id == h1.id


def test_history_repo_list_chronological_for_project(db_session, history_repo, project_repo, dev_user, artifact_repo):
    """Chronological listing returns oldest first."""
    project = Project(id=project_repo.new_id(), name="Test Project", owner_id=dev_user.id)
    project_repo.add(project)
    project_repo.commit()

    artifact = Artifact(
        id=artifact_repo.new_id(), project_id=project.id, created_by=dev_user.id,
        artifact_type="user_story", title="Test Artifact", content={"key": "value"}, version=1,
    )
    artifact_repo.add(artifact)
    artifact_repo.commit()

    h1 = GenerationHistory(
        id=history_repo.new_id(), project_id=project.id, artifact_id=artifact.id, user_id=dev_user.id,
        engine_request_id="er-1", artifact_type="user_story",
        prompt_version="v1", usage={}, latency_ms=100,
        requirement_text="req", eval_score=None, retry_count=0,
        model_used=None,
    )
    h2 = GenerationHistory(
        id=history_repo.new_id(), project_id=project.id, artifact_id=artifact.id, user_id=dev_user.id,
        engine_request_id="er-2", artifact_type="task",
        prompt_version="v2", usage={}, latency_ms=200,
        requirement_text="req 2", eval_score=None, retry_count=0,
        model_used=None,
    )
    history_repo.add(h1)
    history_repo.add(h2)
    history_repo.commit()

    results = history_repo.list_chronological_for_project(project.id)
    assert len(results) == 2
    assert results[0].id == h1.id
    assert results[1].id == h2.id


def test_history_repo_get_for_artifact(db_session, history_repo, project_repo, dev_user, artifact_repo):
    """Get a single history entry for a specific artifact."""
    project = Project(id=project_repo.new_id(), name="Test Project", owner_id=dev_user.id)
    project_repo.add(project)
    project_repo.commit()

    artifact = Artifact(
        id=artifact_repo.new_id(), project_id=project.id, created_by=dev_user.id,
        artifact_type="user_story", title="Test Artifact", content={"key": "value"}, version=1,
    )
    artifact_repo.add(artifact)
    artifact_repo.commit()

    h = GenerationHistory(
        id=history_repo.new_id(), project_id=project.id, artifact_id=artifact.id, user_id=dev_user.id,
        engine_request_id="er-1", artifact_type="user_story",
        prompt_version="v1", usage={}, latency_ms=100,
        requirement_text="req", eval_score=0.8, retry_count=0,
        model_used="model-x",
    )
    history_repo.add(h)
    history_repo.commit()

    found = history_repo.get_for_artifact(artifact.id)
    assert found is not None
    assert found.id == h.id
    assert found.eval_score == 0.8

    not_found = history_repo.get_for_artifact("nonexistent")
    assert not_found is None


def test_history_repo_stats_for_project(db_session, history_repo, project_repo, dev_user, artifact_repo):
    """Stats computes total, by_type, and avg_eval_score correctly."""
    project = Project(id=project_repo.new_id(), name="Test Project", owner_id=dev_user.id)
    project_repo.add(project)
    project_repo.commit()

    artifact = Artifact(
        id=artifact_repo.new_id(), project_id=project.id, created_by=dev_user.id,
        artifact_type="user_story", title="Test Artifact", content={"key": "value"}, version=1,
    )
    artifact_repo.add(artifact)
    artifact_repo.commit()

    h1 = GenerationHistory(
        id=history_repo.new_id(), project_id=project.id, artifact_id=artifact.id, user_id=dev_user.id,
        engine_request_id="er-1", artifact_type="user_story",
        prompt_version="v1", usage={}, latency_ms=100,
        requirement_text="req", eval_score=0.9, retry_count=0,
        model_used="m1",
    )
    h2 = GenerationHistory(
        id=history_repo.new_id(), project_id=project.id, artifact_id=artifact.id, user_id=dev_user.id,
        engine_request_id="er-2", artifact_type="user_story",
        prompt_version="v2", usage={}, latency_ms=200,
        requirement_text="req 2", eval_score=0.7, retry_count=1,
        model_used="m2",
    )
    h3 = GenerationHistory(
        id=history_repo.new_id(), project_id=project.id, artifact_id=artifact.id, user_id=dev_user.id,
        engine_request_id="er-3", artifact_type="task",
        prompt_version="v3", usage={}, latency_ms=50,
        requirement_text="req 3", eval_score=None, retry_count=0,
        model_used=None,
    )
    history_repo.add(h1)
    history_repo.add(h2)
    history_repo.add(h3)
    history_repo.commit()

    stats = history_repo.stats_for_project(project.id)
    assert stats["total_generations"] == 3
    assert stats["by_type"] == {"user_story": 2, "task": 1}
    assert abs(stats["avg_eval_score"] - 0.8) < 0.001


def test_history_repo_stats_empty_project(db_session, history_repo, project_repo, dev_user, artifact_repo):
    """Stats for a project with no generations returns zeros."""
    project = Project(id=project_repo.new_id(), name="Test Project", owner_id=dev_user.id)
    project_repo.add(project)
    project_repo.commit()

    stats = history_repo.stats_for_project(project.id)
    assert stats["total_generations"] == 0
    assert stats["by_type"] == {}
    assert stats["avg_eval_score"] is None


def test_history_repo_crud(db_session, history_repo, project_repo, dev_user, artifact_repo):
    """BaseRepository CRUD operations work on GenerationHistory."""
    project = Project(id=project_repo.new_id(), name="Test Project", owner_id=dev_user.id)
    project_repo.add(project)
    project_repo.commit()

    artifact = Artifact(
        id=artifact_repo.new_id(), project_id=project.id, created_by=dev_user.id,
        artifact_type="user_story", title="Test Artifact", content={"key": "value"}, version=1,
    )
    artifact_repo.add(artifact)
    artifact_repo.commit()

    hist_id = history_repo.new_id()
    history = GenerationHistory(
        id=hist_id, project_id=project.id, artifact_id=artifact.id, user_id=dev_user.id,
        engine_request_id="er-1", artifact_type="user_story",
        prompt_version="v1", usage={}, latency_ms=100,
        requirement_text="req", eval_score=0.5, retry_count=0,
        model_used="m1",
    )
    history_repo.add(history)
    history_repo.commit()

    retrieved = history_repo.get(hist_id)
    assert retrieved is not None
    assert retrieved.eval_score == 0.5

    retrieved.eval_score = 0.9
    history_repo.commit()

    updated = history_repo.get(hist_id)
    assert updated.eval_score == 0.9

    history_repo.delete(updated)
    history_repo.commit()

    assert history_repo.get(hist_id) is None
