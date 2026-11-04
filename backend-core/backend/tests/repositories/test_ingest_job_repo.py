from app.repositories.ingest_job_repo import IngestJobRepository


class FakeSession:
    def __init__(self, rows=()):
        self.rows = rows
        self.statements = []

    def scalars(self, statement):
        self.statements.append(statement)
        return iter(self.rows)


def test_get_by_requirement_returns_rows_ordered_by_creation_time():
    rows = [object(), object()]
    db = FakeSession(rows)

    result = IngestJobRepository(db).get_by_requirement("requirement-1")

    assert result == rows
    statement = str(db.statements[0])
    assert "ingest_jobs.requirement_id" in statement
    assert "created_at DESC" in statement


def test_get_pending_filters_processing_jobs():
    rows = [object()]
    db = FakeSession(rows)

    result = IngestJobRepository(db).get_pending()

    assert result == rows
    assert "ingest_jobs.status =" in str(db.statements[0])
    assert "processing" in db.statements[0].compile().params.values()

