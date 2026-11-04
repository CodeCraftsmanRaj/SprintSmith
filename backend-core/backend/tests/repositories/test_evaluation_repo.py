"""
Repository tests for EvaluationRepository.

Verifies:
- Listing evaluations for an artifact (ordered by created_at desc)
- Average score computation across artifact IDs
- Empty artifact list returns None
- CRUD operations via BaseRepository
"""

from app.domain.models import Artifact, Evaluation, Project
from app.repositories.evaluation_repo import EvaluationRepository


def test_evaluation_repo_list_for_artifact(db_session, evaluation_repo, project_repo, dev_user, artifact_repo):
    """Evaluations are returned for a specific artifact, newest first."""
    project = Project(id=project_repo.new_id(), name="Test Project", owner_id=dev_user.id)
    project_repo.add(project)
    project_repo.commit()

    artifact = Artifact(
        id=artifact_repo.new_id(),
        project_id=project.id,
        created_by=dev_user.id,
        artifact_type="user_story",
        title="Test Artifact",
        content={"key": "value"},
        version=1,
    )
    artifact_repo.add(artifact)
    artifact_repo.commit()

    artifact_id = artifact.id
    user_id = dev_user.id

    e1 = Evaluation(
        id=evaluation_repo.new_id(), artifact_id=artifact_id, user_id=user_id,
        score=5, feedback="good", metrics={"a": 1},
    )
    e2 = Evaluation(
        id=evaluation_repo.new_id(), artifact_id=artifact_id, user_id=user_id,
        score=3, feedback="ok", metrics={"b": 2},
    )
    e3 = Evaluation(
        id=evaluation_repo.new_id(), artifact_id="other-artifact", user_id=user_id,
        score=4, feedback="other", metrics={"c": 3},
    )
    evaluation_repo.add(e1)
    evaluation_repo.add(e2)
    evaluation_repo.add(e3)
    evaluation_repo.commit()

    results = evaluation_repo.list_for_artifact(artifact_id)
    assert len(results) == 2
    assert results[0].id == e2.id
    assert results[1].id == e1.id


def test_evaluation_repo_avg_score_for_artifact_ids(db_session, evaluation_repo, project_repo, dev_user, artifact_repo):
    """Average score is computed across the given artifact IDs."""
    project = Project(id=project_repo.new_id(), name="Test Project", owner_id=dev_user.id)
    project_repo.add(project)
    project_repo.commit()

    artifact_a1 = Artifact(
        id=artifact_repo.new_id(), project_id=project.id, created_by=dev_user.id,
        artifact_type="user_story", title="Artifact 1", content={"key": "value"}, version=1,
    )
    artifact_a2 = Artifact(
        id=artifact_repo.new_id(), project_id=project.id, created_by=dev_user.id,
        artifact_type="user_story", title="Artifact 2", content={"key": "value"}, version=1,
    )
    artifact_repo.add(artifact_a1)
    artifact_repo.add(artifact_a2)
    artifact_repo.commit()

    user_id = dev_user.id

    e1 = Evaluation(id=evaluation_repo.new_id(), artifact_id=artifact_a1.id, user_id=user_id,
                    score=4, metrics={})
    e2 = Evaluation(id=evaluation_repo.new_id(), artifact_id=artifact_a1.id, user_id=user_id,
                    score=2, metrics={})
    e3 = Evaluation(id=evaluation_repo.new_id(), artifact_id=artifact_a2.id, user_id=user_id,
                    score=5, metrics={})
    evaluation_repo.add(e1)
    evaluation_repo.add(e2)
    evaluation_repo.add(e3)
    evaluation_repo.commit()

    avg = evaluation_repo.avg_score_for_artifact_ids([artifact_a1.id])
    assert avg == 3.0

    avg_all = evaluation_repo.avg_score_for_artifact_ids([artifact_a1.id, artifact_a2.id])
    assert abs(avg_all - 3.667) < 0.001


def test_evaluation_repo_avg_score_empty_list(evaluation_repo):
    """Empty artifact ID list returns None."""
    avg = evaluation_repo.avg_score_for_artifact_ids([])
    assert avg is None


def test_evaluation_repo_avg_score_no_evaluations(db_session, evaluation_repo, project_repo, dev_user, artifact_repo):
    """Artifact IDs with no evaluations returns None."""
    project = Project(id=project_repo.new_id(), name="Test Project", owner_id=dev_user.id)
    project_repo.add(project)
    project_repo.commit()

    artifact = Artifact(
        id=artifact_repo.new_id(), project_id=project.id, created_by=dev_user.id,
        artifact_type="user_story", title="Test Artifact", content={"key": "value"}, version=1,
    )
    artifact_repo.add(artifact)
    artifact_repo.commit()

    avg = evaluation_repo.avg_score_for_artifact_ids([artifact.id])
    assert avg is None


def test_evaluation_repo_crud(db_session, evaluation_repo, project_repo, dev_user, artifact_repo):
    """BaseRepository CRUD operations work on Evaluation."""
    project = Project(id=project_repo.new_id(), name="Test Project", owner_id=dev_user.id)
    project_repo.add(project)
    project_repo.commit()

    artifact = Artifact(
        id=artifact_repo.new_id(), project_id=project.id, created_by=dev_user.id,
        artifact_type="user_story", title="Test Artifact", content={"key": "value"}, version=1,
    )
    artifact_repo.add(artifact)
    artifact_repo.commit()

    eval_id = evaluation_repo.new_id()
    evaluation = Evaluation(
        id=eval_id, artifact_id=artifact.id, user_id=dev_user.id,
        score=4, feedback="nice job", metrics={"x": 1},
    )
    evaluation_repo.add(evaluation)
    evaluation_repo.commit()

    retrieved = evaluation_repo.get(eval_id)
    assert retrieved is not None
    assert retrieved.score == 4
    assert retrieved.feedback == "nice job"

    retrieved.score = 5
    evaluation_repo.commit()

    updated = evaluation_repo.get(eval_id)
    assert updated.score == 5

    evaluation_repo.delete(updated)
    evaluation_repo.commit()

    assert evaluation_repo.get(eval_id) is None
