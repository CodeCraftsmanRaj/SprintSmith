"""
Requirement Ingestion API endpoints (UC-01) — decomposed router.
NOT MOUNTED YET (Sprint 6 target per AGENTS.md). Kept current with the live async
contract in app/main.py: upload → 202 job → poll ingest-jobs → terminal state persists
chunks_indexed + doc_tree_nodes via app.services.ingest_service.
"""

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, get_project_service
from app.config import settings
from app.core.exceptions import AuthorisationError, ResourceNotFoundError
from app.domain.models import AuditLog, IngestJob, Requirement, RequirementVersion, User
from app.domain.schemas.requirement import RequirementReview, RequirementUpdate
from app.services import ingest_service
from app.services.project_service import ProjectService

router = APIRouter(tags=["Requirements"])


@router.post("/projects/{project_id}/requirements", status_code=status.HTTP_202_ACCEPTED,
             responses={415: {"description": "Unsupported requirement file type"},
                        413: {"description": "Requirement file exceeds 10 MB"}})
async def ingest_requirement(
    project_id: str,
    file: UploadFile = File(...),
    doc_type: str = "requirement",
    db: Session = Depends(get_db),
    project_service: ProjectService = Depends(get_project_service),
    user: User = Depends(get_current_user),
):
    """§2.2.4: uploads return 202 immediately; parse+index runs as an ai-engine job.
    Poll GET /ingest-jobs/{id} for progress."""
    try:
        project_service.get_project_or_fail(project_id, user, write=True)
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except AuthorisationError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))

    data = await file.read(ingest_service.MAX_FILE_SIZE + 1)
    record, job = await ingest_service.create_ingest_job(
        db, project_id=project_id, user=user, data=data,
        filename=file.filename or "requirement.txt", doc_type=doc_type,
        upload_dir=settings.upload_dir)
    return {"id": record.id, "filename": record.filename, "project_id": project_id,
            "ingest_job_id": job.id, "status": job.status}


@router.get("/ingest-jobs/{job_id}", responses={404: {"description": "Ingest job not found"}})
async def read_ingest_job(
    job_id: str,
    db: Session = Depends(get_db),
    project_service: ProjectService = Depends(get_project_service),
    user: User = Depends(get_current_user),
):
    """Poll the ai-engine ingest job; on first terminal state persist results (idempotent)."""
    job = db.get(IngestJob, job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ingest job not found")
    requirement = db.get(Requirement, job.requirement_id)
    if not requirement:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ingest job not found")
    try:
        project_service.get_project_or_fail(requirement.project_id, user)
    except AuthorisationError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))

    job = await ingest_service.poll_and_finalize(db, job)
    return {"id": job.id, "requirement_id": job.requirement_id, "status": job.status,
            "chunks_indexed": job.chunks_indexed, "error_message": job.error_message,
            "created_at": job.created_at, "updated_at": job.updated_at}


@router.get("/projects/{project_id}/requirements")
def list_requirements(
    project_id: str,
    category: str | None = None,
    priority: str | None = Query(default=None, pattern="^(low|medium|high|critical)$"),
    review_status: str | None = Query(default=None, pattern="^(pending|approved|rejected)$"),
    tag: str | None = None,
    db: Session = Depends(get_db),
    project_service: ProjectService = Depends(get_project_service),
    user: User = Depends(get_current_user),
):
    try:
        project_service.get_project_or_fail(project_id, user)
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except AuthorisationError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))

    stmt = select(Requirement).where(Requirement.project_id == project_id)
    if category is not None:
        stmt = stmt.where(Requirement.category == category)
    if priority is not None:
        stmt = stmt.where(Requirement.priority == priority)
    if review_status is not None:
        stmt = stmt.where(Requirement.review_status == review_status)
    rows = db.scalars(stmt.order_by(Requirement.created_at.desc())).all()
    if tag is not None:
        rows = [row for row in rows if tag in (row.tags or [])]
    return [
        {
            "id": r.id,
            "project_id": r.project_id,
            "filename": r.filename,
            "doc_type": r.doc_type,
            "chunks_indexed": r.chunks_indexed,
            "content": r.content,
            "category": r.category,
            "tags": r.tags or [],
            "priority": r.priority,
            "review_status": r.review_status,
            "version": r.version,
            "index_stale": r.index_stale,
            "created_at": r.created_at,
            "updated_at": r.updated_at,
        }
        for r in rows
    ]


@router.get("/requirements/{requirement_id}")
def read_requirement(
    requirement_id: str,
    db: Session = Depends(get_db),
    project_service: ProjectService = Depends(get_project_service),
    user: User = Depends(get_current_user),
):
    requirement = db.get(Requirement, requirement_id)
    if not requirement:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requirement not found")
    try:
        project_service.get_project_or_fail(requirement.project_id, user)
    except AuthorisationError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))

    return {
        "id": requirement.id,
        "project_id": requirement.project_id,
        "filename": requirement.filename,
        "doc_type": requirement.doc_type,
        "content": requirement.content,
        "chunks_indexed": requirement.chunks_indexed,
        "category": requirement.category,
        "tags": requirement.tags or [],
        "priority": requirement.priority,
        "review_status": requirement.review_status,
        "version": requirement.version,
        "index_stale": requirement.index_stale,
        "created_at": requirement.created_at,
        "updated_at": requirement.updated_at,
    }


def _requirement_or_404(db: Session, requirement_id: str) -> Requirement:
    requirement = db.get(Requirement, requirement_id)
    if requirement is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requirement not found")
    return requirement


def _check_write_access(requirement: Requirement, project_service: ProjectService, user: User) -> None:
    try:
        project_service.get_project_or_fail(requirement.project_id, user, write=True)
    except ResourceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except AuthorisationError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


def _snapshot(requirement: Requirement) -> dict:
    return {
        "filename": requirement.filename,
        "doc_type": requirement.doc_type,
        "content": requirement.content,
        "category": requirement.category,
        "tags": requirement.tags or [],
        "priority": requirement.priority,
        "review_status": requirement.review_status,
        "version": requirement.version,
        "index_stale": requirement.index_stale,
    }


def _save_version(db: Session, requirement: Requirement, user: User, summary: str) -> None:
    db.add(RequirementVersion(
        id=str(uuid.uuid4()), requirement_id=requirement.id, version=requirement.version,
        changed_by=user.id, snapshot=_snapshot(requirement), change_summary=summary,
    ))


@router.patch("/requirements/{requirement_id}")
def update_requirement(
    requirement_id: str,
    payload: RequirementUpdate,
    db: Session = Depends(get_db),
    project_service: ProjectService = Depends(get_project_service),
    user: User = Depends(get_current_user),
):
    requirement = _requirement_or_404(db, requirement_id)
    _check_write_access(requirement, project_service, user)
    if payload.expected_version is not None and payload.expected_version != requirement.version:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail={"message": "Requirement changed since it was loaded",
                                    "current_version": requirement.version})

    changes = payload.model_dump(exclude_unset=True, exclude={"expected_version", "change_summary"})
    for required_field in ("content", "filename", "tags", "priority"):
        if required_field in changes and changes[required_field] is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                                detail=f"{required_field} cannot be null")
    changes = {key: value for key, value in changes.items() if getattr(requirement, key) != value}
    if changes:
        _save_version(db, requirement, user, payload.change_summary)
        for key, value in changes.items():
            setattr(requirement, key, value)
        requirement.review_status = "pending"
        if "content" in changes:
            # Existing vector chunks still describe the previous content.
            requirement.index_stale = True
        requirement.version += 1
        db.add(AuditLog(id=str(uuid.uuid4()), user_id=user.id, action="requirement.update",
                        resource_type="requirement", resource_id=requirement.id,
                        details={"version": requirement.version, "fields": sorted(changes)}))
        db.commit()
        db.refresh(requirement)
    return {**_snapshot(requirement), "id": requirement.id, "project_id": requirement.project_id,
            "index_stale": requirement.index_stale,
            "chunks_indexed": requirement.chunks_indexed,
            "created_at": requirement.created_at, "updated_at": requirement.updated_at}


@router.post("/requirements/{requirement_id}/review")
def review_requirement(
    requirement_id: str,
    payload: RequirementReview,
    db: Session = Depends(get_db),
    project_service: ProjectService = Depends(get_project_service),
    user: User = Depends(get_current_user),
):
    requirement = _requirement_or_404(db, requirement_id)
    _check_write_access(requirement, project_service, user)
    if payload.expected_version is not None and payload.expected_version != requirement.version:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail={"message": "Requirement changed since it was loaded",
                                    "current_version": requirement.version})
    if requirement.review_status != payload.decision:
        _save_version(db, requirement, user,
                      payload.review_note or f"Review status changed to {payload.decision}")
        requirement.review_status = payload.decision
        requirement.version += 1
        db.add(AuditLog(id=str(uuid.uuid4()), user_id=user.id, action="requirement.review",
                        resource_type="requirement", resource_id=requirement.id,
                        details={"decision": payload.decision, "note": payload.review_note,
                                 "version": requirement.version}))
        db.commit()
        db.refresh(requirement)
    return {**_snapshot(requirement), "id": requirement.id, "project_id": requirement.project_id,
            "index_stale": requirement.index_stale,
            "chunks_indexed": requirement.chunks_indexed,
            "created_at": requirement.created_at, "updated_at": requirement.updated_at}


@router.get("/requirements/{requirement_id}/versions")
def requirement_versions(
    requirement_id: str,
    db: Session = Depends(get_db),
    project_service: ProjectService = Depends(get_project_service),
    user: User = Depends(get_current_user),
):
    requirement = _requirement_or_404(db, requirement_id)
    try:
        project_service.get_project_or_fail(requirement.project_id, user)
    except ResourceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except AuthorisationError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    rows = db.scalars(select(RequirementVersion)
                      .where(RequirementVersion.requirement_id == requirement_id)
                      .order_by(RequirementVersion.version.desc())).all()
    return {"versions": [{"id": row.id, "requirement_id": row.requirement_id,
                          "version": row.version, "changed_by": row.changed_by,
                          "snapshot": row.snapshot, "change_summary": row.change_summary,
                          "created_at": row.created_at} for row in rows]}
