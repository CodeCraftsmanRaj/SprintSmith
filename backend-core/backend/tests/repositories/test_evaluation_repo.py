"""
Repository tests for EvaluationRepository.

Verifies:
- Listing evaluations for an artifact (ordered by created_at desc)
- Average score computation across artifact IDs
- Empty artifact list returns None
- CRUD operations via BaseRepository
"""

from app.domain.models import Artifact, Evaluation, Project, User
from app.repositories.evaluation_repo import EvaluationRepository


def _create_artifact_and_user(db_session, evaluation_repo, artifact_id="artifact-1"):
    """Create parent Project, User, and Artifact so FK constraints are satisfied.
    Commit after each parent entity so PostgreSQL FK constraints pass."""
    user = User(id="user-1", email="user-1@example.com", full_name="Test User",
                password_hash="hashed", role="member")
    db_session.add(user)
    db_session.commit()
    project = Project(id="proj-1", name="Test Project", owner_id="user-1")
    db_session.add(project)
    db_session.commit()
    artifact = Artifact(id=artifact_id, project_id="proj-1", created_by="user-1",
                        artifact_type="user_story", title="Test Artifact",
                        content={"key": "value"}, version=1)
    db_session.add(artifact)
    db_session.commit()


def test_evaluation_repo_list_for_artifact(db_session, evaluation_repo):
    """Evaluations are returned for a specific artifact, newest first."""
    _create_artifact_and_user(db_session, evaluation_repo)
    artifact_id = "artifact-1"
    user_id = "user-1"

    e1 = Evaluation(
        id="eval-1", artifact_id=artifact_id, user_id=user_id,
        score=5, feedback="good", metrics={"a": 1},
    )
    e2 = Evaluation(
        id="eval-2", artifact_id=artifact_id, user_id=user_id,
        score=3, feedback="ok", metrics={"b": 2},
    )
    e3 = Evaluation(
        id="eval-3", artifact_id="other-artifact", user_id=user_id,
        score=4, feedback="other", metrics={"c": 3},
    )
    evaluation_repo.add(e1)
    evaluation_repo.add(e2)
    evaluation_repo.add(e3)
    evaluation_repo.commit()

    results = evaluation_repo.list_for_artifact(artifact_id)
    assert len(results) == 2
    assert results[0].id == "eval-2"
    assert results[1].id == "eval-1"


def test_evaluation_repo_avg_score_for_artifact_ids(db_session, evaluation_repo):
    """Average score is computed across the given artifact IDs."""
    _create_artifact_and_user(db_session, evaluation_repo, artifact_id="a1")
    artifact_a2 = Artifact(id="a2", project_id="proj-1", created_by="user-1",
                           artifact_type="user_story", title="Artifact 2",
                           content={"key": "value"}, version=1)
    db_session.add(artifact_a2)
    db_session.commit()
    user_id = "user-1"

    e1 = Evaluation(id="e1", artifact_id="a1", user_id=user_id, score=4, metrics={})
    e2 = Evaluation(id="e2", artifact_id="a1", user_id=user_id, score=2, metrics={})
    e3 = Evaluation(id="e3", artifact_id="a2", user_id=user_id, score=5, metrics={})
    evaluation_repo.add(e1)
    evaluation_repo.add(e2)
    evaluation_repo.add(e3)
    evaluation_repo.commit()

    avg = evaluation_repo.avg_score_for_artifact_ids(["a1"])
    assert avg == 3.0

    avg_all = evaluation_repo.avg_score_for_artifact_ids(["a1", "a2"])
    assert abs(avg_all - 3.667) < 0.001


def test_evaluation_repo_avg_score_empty_list(evaluation_repo):
    """Empty artifact ID list returns None."""
    avg = evaluation_repo.avg_score_for_artifact_ids([])
    assert avg is None


def test_evaluation_repo_avg_score_no_evaluations(db_session, evaluation_repo):
    """Artifact IDs with no evaluations returns None."""
    _create_artifact_and_user(db_session, evaluation_repo, artifact_id="nonexistent")
    avg = evaluation_repo.avg_score_for_artifact_ids(["nonexistent"])
    assert avg is None


def test_evaluation_repo_crud(db_session, evaluation_repo):
    """BaseRepository CRUD operations work on Evaluation."""
    _create_artifact_and_user(db_session, evaluation_repo, artifact_id="art-1")
    eval_id = evaluation_repo.new_id()
    evaluation = Evaluation(
        id=eval_id, artifact_id="art-1", user_id="user-1",
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
