"""
Repository tests for IngestJobRepository.

Verifies:
- Listing ingest jobs for a requirement (newest first)
- Getting pending (processing) ingest jobs
- CRUD operations via BaseRepository
"""

from app.domain.models import IngestJob, Project, Requirement
from app.repositories.ingest_job_repo import IngestJobRepository


def test_ingest_job_repo_get_by_requirement(db_session, ingest_job_repo, project_repo, dev_user, artifact_repo):
    """Ingest jobs are returned for a specific requirement, newest first."""
    project = Project(id=project_repo.new_id(), name="Test Project", owner_id=dev_user.id)
    project_repo.add(project)
    project_repo.commit()

    requirement = Requirement(
        id=ingest_job_repo.new_id(), project_id=project.id, uploaded_by=dev_user.id,
        filename="test.txt", file_path="/tmp/test.txt", content="",
        doc_type="requirement", chunks_indexed=0,
    )
    db_session.add(requirement)
    db_session.commit()

    req1 = Requirement(
        id=ingest_job_repo.new_id(), project_id=project.id, uploaded_by=dev_user.id,
        filename="r1.txt", file_path="/tmp/r1.txt", content="",
        doc_type="requirement", chunks_indexed=0,
    )
    db_session.add(req1)
    db_session.commit()

    req2 = Requirement(
        id=ingest_job_repo.new_id(), project_id=project.id, uploaded_by=dev_user.id,
        filename="r2.txt", file_path="/tmp/r2.txt", content="",
        doc_type="requirement", chunks_indexed=0,
    )
    db_session.add(req2)
    db_session.commit()

    req3 = Requirement(
        id=ingest_job_repo.new_id(), project_id=project.id, uploaded_by=dev_user.id,
        filename="r3.txt", file_path="/tmp/r3.txt", content="",
        doc_type="requirement", chunks_indexed=0,
    )
    db_session.add(req3)
    db_session.commit()

    req4 = Requirement(
        id=ingest_job_repo.new_id(), project_id=project.id, uploaded_by=dev_user.id,
        filename="r4.txt", file_path="/tmp/r4.txt", content="",
        doc_type="requirement", chunks_indexed=0,
    )
    db_session.add(req4)
    db_session.commit()

    j1 = IngestJob(
        id=ingest_job_repo.new_id(), requirement_id=requirement.id, engine_job_id="eng-1",
        status="done", chunks_indexed=10,
    )
    j2 = IngestJob(
        id=ingest_job_repo.new_id(), requirement_id=requirement.id, engine_job_id="eng-2",
        status="processing", chunks_indexed=0,
    )
    j3 = IngestJob(
        id=ingest_job_repo.new_id(), requirement_id=req3.id, engine_job_id="eng-3",
        status="done", chunks_indexed=5,
    )
    j4 = IngestJob(
        id=ingest_job_repo.new_id(), requirement_id=req4.id, engine_job_id="eng-4",
        status="done", chunks_indexed=5,
    )
    ingest_job_repo.add(j1)
    ingest_job_repo.add(j2)
    ingest_job_repo.add(j3)
    ingest_job_repo.add(j4)
    ingest_job_repo.commit()

    results = ingest_job_repo.get_by_requirement(requirement.id)
    assert len(results) == 2
    assert results[0].id == j2.id
    assert results[1].id == j1.id


def test_ingest_job_repo_get_pending(db_session, ingest_job_repo, project_repo, dev_user):
    """Only jobs with status 'processing' are returned."""
    project = Project(id=project_repo.new_id(), name="Test Project", owner_id=dev_user.id)
    project_repo.add(project)
    project_repo.commit()

    req1 = Requirement(
        id=ingest_job_repo.new_id(), project_id=project.id, uploaded_by=dev_user.id,
        filename="r1.txt", file_path="/tmp/r1.txt", content="",
        doc_type="requirement", chunks_indexed=0,
    )
    req2 = Requirement(
        id=ingest_job_repo.new_id(), project_id=project.id, uploaded_by=dev_user.id,
        filename="r2.txt", file_path="/tmp/r2.txt", content="",
        doc_type="requirement", chunks_indexed=0,
    )
    req3 = Requirement(
        id=ingest_job_repo.new_id(), project_id=project.id, uploaded_by=dev_user.id,
        filename="r3.txt", file_path="/tmp/r3.txt", content="",
        doc_type="requirement", chunks_indexed=0,
    )
    req4 = Requirement(
        id=ingest_job_repo.new_id(), project_id=project.id, uploaded_by=dev_user.id,
        filename="r4.txt", file_path="/tmp/r4.txt", content="",
        doc_type="requirement", chunks_indexed=0,
    )
    db_session.add(req1)
    db_session.add(req2)
    db_session.add(req3)
    db_session.add(req4)
    db_session.commit()

    j1 = IngestJob(id=ingest_job_repo.new_id(), requirement_id=req1.id, status="processing", chunks_indexed=0)
    j2 = IngestJob(id=ingest_job_repo.new_id(), requirement_id=req2.id, status="done", chunks_indexed=5)
    j3 = IngestJob(id=ingest_job_repo.new_id(), requirement_id=req3.id, status="processing", chunks_indexed=0)
    j4 = IngestJob(id=ingest_job_repo.new_id(), requirement_id=req4.id, status="failed", chunks_indexed=0)
    ingest_job_repo.add(j1)
    ingest_job_repo.add(j2)
    ingest_job_repo.add(j3)
    ingest_job_repo.add(j4)
    ingest_job_repo.commit()

    pending = ingest_job_repo.get_pending()
    assert len(pending) == 2
    ids = {p.id for p in pending}
    assert ids == {j1.id, j3.id}


def test_ingest_job_repo_crud(db_session, ingest_job_repo, project_repo, dev_user):
    """BaseRepository CRUD operations work on IngestJob."""
    project = Project(id=project_repo.new_id(), name="Test Project", owner_id=dev_user.id)
    project_repo.add(project)
    project_repo.commit()

    requirement = Requirement(
        id=ingest_job_repo.new_id(), project_id=project.id, uploaded_by=dev_user.id,
        filename="test.txt", file_path="/tmp/test.txt", content="",
        doc_type="requirement", chunks_indexed=0,
    )
    db_session.add(requirement)
    db_session.commit()

    job_id = ingest_job_repo.new_id()
    job = IngestJob(
        id=job_id, requirement_id=requirement.id, engine_job_id="eng-1",
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