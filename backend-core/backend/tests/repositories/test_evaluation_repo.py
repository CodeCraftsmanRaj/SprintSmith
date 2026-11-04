"""
Repository tests for EvaluationRepository.

Verifies:
- Listing evaluations for an artifact (ordered by created_at desc)
- Average score computation across artifact IDs
- Empty artifact list returns None
- CRUD operations via BaseRepository
"""

from app.domain.models import Evaluation, User
from app.repositories.evaluation_repo import EvaluationRepository


def test_evaluation_repo_list_for_artifact(evaluation_repo, dev_user):
    """Evaluations are returned for a specific artifact, newest first."""
    artifact_id = "artifact-1"
    user_id = dev_user.id

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
    # Newest first: eval-2 was added after eval-1
    assert results[0].id == "eval-2"
    assert results[1].id == "eval-1"


def test_evaluation_repo_avg_score_for_artifact_ids(evaluation_repo, dev_user):
    """Average score is computed across the given artifact IDs."""
    user_id = dev_user.id

    e1 = Evaluation(id="e1", artifact_id="a1", user_id=user_id, score=4, metrics={})
    e2 = Evaluation(id="e2", artifact_id="a1", user_id=user_id, score=2, metrics={})
    e3 = Evaluation(id="e3", artifact_id="a2", user_id=user_id, score=5, metrics={})
    evaluation_repo.add(e1)
    evaluation_repo.add(e2)
    evaluation_repo.add(e3)
    evaluation_repo.commit()

    # a1 average: (4 + 2) / 2 = 3.0
    avg = evaluation_repo.avg_score_for_artifact_ids(["a1"])
    assert avg == 3.0

    # Both artifacts: (4 + 2 + 5) / 3 = 3.666...
    avg_all = evaluation_repo.avg_score_for_artifact_ids(["a1", "a2"])
    assert abs(avg_all - 3.667) < 0.001


def test_evaluation_repo_avg_score_empty_list(evaluation_repo):
    """Empty artifact ID list returns None."""
    avg = evaluation_repo.avg_score_for_artifact_ids([])
    assert avg is None


def test_evaluation_repo_avg_score_no_evaluations(evaluation_repo):
    """Artifact IDs with no evaluations returns None."""
    avg = evaluation_repo.avg_score_for_artifact_ids(["nonexistent"])
    assert avg is None


def test_evaluation_repo_crud(evaluation_repo, dev_user):
    """BaseRepository CRUD operations work on Evaluation."""
    eval_id = evaluation_repo.new_id()
    evaluation = Evaluation(
        id=eval_id, artifact_id="art-1", user_id=dev_user.id,
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
