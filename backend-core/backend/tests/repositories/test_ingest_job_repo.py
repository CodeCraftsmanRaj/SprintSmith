"""
Repository tests for IngestJobRepository.

Verifies:
- Listing ingest jobs for a requirement (newest first)
- Getting pending (processing) ingest jobs
- CRUD operations via BaseRepository
"""

from app.domain.models import IngestJob, Project, Requirement, User
from app.repositories.ingest_job_repo import IngestJobRepository


def _create_project_and_user(db_session):
    """Create parent Project and User so FK constraints are satisfied."""
    user = User(id="user-1", email="user-1@example.com", full_name="Test User",
                password_hash="hashed", role="member")
    db_session.add(user)
    db_session.commit()
    project = Project(id="proj-1", name="Test Project", owner_id="user-1")
    db_session.add(project)
    db_session.commit()


def _create_requirement(db_session, ingest_job_repo, requirement_id="req-1"):
    """Create a Requirement so FK constraint is satisfied."""
    req = Requirement(
        id=requirement_id, project_id="proj-1", uploaded_by="user-1",
        filename="test.txt", file_path="/tmp/test.txt", content="",
        doc_type="requirement", chunks_indexed=0,
    )
    db_session.add(req)
    db_session.commit()


def test_ingest_job_repo_get_by_requirement(db_session, ingest_job_repo):
    """Ingest jobs are returned for a specific requirement, newest first."""
    _create_project_and_user(db_session)
    _create_requirement(db_session, ingest_job_repo)
    req_id = "req-1"

    j1 = IngestJob(
        id="job-1", requirement_id=req_id, engine_job_id="eng-1",
        status="done", chunks_indexed=10,
    )
    j2 = IngestJob(
        id="job-2", requirement_id=req_id, engine_job_id="eng-2",
        status="processing", chunks_indexed=0,
    )
    j3 = IngestJob(
        id="job-3", requirement_id="other-req", engine_job_id="eng-3",
        status="done", chunks_indexed=5,
    )
    ingest_job_repo.add(j1)
    ingest_job_repo.add(j2)
    ingest_job_repo.add(j3)
    ingest_job_repo.commit()

    results = ingest_job_repo.get_by_requirement(req_id)
    assert len(results) == 2
    assert results[0].id == "job-2"
    assert results[1].id == "job-1"


def test_ingest_job_repo_get_pending(db_session, ingest_job_repo):
    """Only jobs with status 'processing' are returned."""
    _create_project_and_user(db_session)
    _create_requirement(db_session, ingest_job_repo, requirement_id="r1")
    _create_requirement(db_session, ingest_job_repo, requirement_id="r2")
    _create_requirement(db_session, ingest_job_repo, requirement_id="r3")
    _create_requirement(db_session, ingest_job_repo, requirement_id="r4")

    j1 = IngestJob(id="j1", requirement_id="r1", status="processing", chunks_indexed=0)
    j2 = IngestJob(id="j2", requirement_id="r2", status="done", chunks_indexed=5)
    j3 = IngestJob(id="j3", requirement_id="r3", status="processing", chunks_indexed=0)
    j4 = IngestJob(id="j4", requirement_id="r4", status="failed", chunks_indexed=0)
    ingest_job_repo.add(j1)
    ingest_job_repo.add(j2)
    ingest_job_repo.add(j3)
    ingest_job_repo.add(j4)
    ingest_job_repo.commit()

    pending = ingest_job_repo.get_pending()
    assert len(pending) == 2
    ids = {p.id for p in pending}
    assert ids == {"j1", "j3"}


def test_ingest_job_repo_crud(db_session, ingest_job_repo):
    """BaseRepository CRUD operations work on IngestJob."""
    _create_project_and_user(db_session)
    _create_requirement(db_session, ingest_job_repo)
    job_id = ingest_job_repo.new_id()
    job = IngestJob(
        id=job_id, requirement_id="req-1", engine_job_id="eng-1",
        status="processing", chunks_indexed=0, error_message=None,
    )
    ingest_job_repo.add(job)
    ingest_job_repo.commit()

    retrieved = ingest_job_repo.get(job_id)
    assert retrieved is not None
    assert retrieved.status == "processing"
    assert retrieved.chunks_indexed == 0

    retrieved.status = "done"
    retrieved.chunks_indexed = 42
    retrieved.error_message = None
    ingest_job_repo.commit()

    updated = ingest_job_repo.get(job_id)
    assert updated.status == "done"
    assert updated.chunks_indexed == 42

    ingest_job_repo.delete(updated)
    ingest_job_repo.commit()

    assert ingest_job_repo.get(job_id) is None
