from app.repositories.evaluation_repo import EvaluationRepository


class FakeSession:
    def __init__(self, *, rows=(), scalar_value=None):
        self.rows = rows
        self.scalar_value = scalar_value
        self.scalar_calls = 0
        self.statement = None

    def scalars(self, statement):
        self.statement = statement
        return iter(self.rows)

    def scalar(self, statement):
        self.statement = statement
        self.scalar_calls += 1
        return self.scalar_value


def test_list_for_artifact_returns_session_rows_in_query_order():
    rows = [object(), object()]
    db = FakeSession(rows=rows)

    result = EvaluationRepository(db).list_for_artifact("artifact-1")

    assert result == rows
    assert "evaluations.artifact_id" in str(db.statement)
    assert "created_at DESC" in str(db.statement)


def test_average_is_not_queried_for_empty_ids():
    db = FakeSession(scalar_value=3.5)

    assert EvaluationRepository(db).avg_score_for_artifact_ids([]) is None
    assert db.scalar_calls == 0


def test_average_converts_database_value_to_float_and_preserves_null():
    db = FakeSession(scalar_value=4)
    repository = EvaluationRepository(db)

    assert repository.avg_score_for_artifact_ids(["a", "b"]) == 4.0
    assert db.scalar_calls == 1
    db.scalar_value = None
    assert repository.avg_score_for_artifact_ids(["a"]) is None

