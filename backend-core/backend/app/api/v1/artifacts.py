"""
Artifact generation, update, evaluation, and export API endpoints.
"""

import io
import json
import zipfile
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_artifact_service, get_current_user, get_db
from app.core.exceptions import AuthorisationError, ResourceNotFoundError, ValidationError
from app.domain.models import Requirement, User
from app.domain.schemas import (ArtifactOut, ArtifactUpdate, EvaluationBaselineCreate,
                                EvaluationCreate, GenerateRequest)
from app.services.ai_engine import AIEngineClient
from app.services.artifact_export import render_artifact_export
from app.services.artifact_service import ArtifactService

router = APIRouter(tags=["Artifacts"])


class BacklogExportRequest(BaseModel):
    target: dict
    dry_run: bool = False
    update_issue_id: str | None = None


@router.post("/projects/{project_id}/evaluation-baselines", status_code=status.HTTP_201_CREATED)
def create_evaluation_baseline(
    project_id: str,
    payload: EvaluationBaselineCreate,
    artifact_service: ArtifactService = Depends(get_artifact_service),
    user: User = Depends(get_current_user),
):
    try:
        return artifact_service.create_baseline(project_id, payload.model_dump(), user)
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except AuthorisationError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e)) from e
    except ValidationError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)) from e


@router.get("/projects/{project_id}/evaluation-baselines")
def list_evaluation_baselines(
    project_id: str,
    artifact_service: ArtifactService = Depends(get_artifact_service),
    user: User = Depends(get_current_user),
):
    try:
        return {"baselines": artifact_service.list_baselines(project_id, user)}
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except AuthorisationError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e)) from e


@router.post("/evaluation-baselines/{baseline_id}/compare/{artifact_id}",
             status_code=status.HTTP_201_CREATED)
def compare_artifact_to_baseline(
    baseline_id: str,
    artifact_id: str,
    artifact_service: ArtifactService = Depends(get_artifact_service),
    user: User = Depends(get_current_user),
):
    try:
        return artifact_service.compare_to_baseline(baseline_id, artifact_id, user)
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except AuthorisationError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e)) from e
    except ValidationError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)) from e


@router.get("/evaluation-baselines/{baseline_id}/comparisons")
def list_baseline_comparisons(
    baseline_id: str,
    artifact_service: ArtifactService = Depends(get_artifact_service),
    user: User = Depends(get_current_user),
):
    try:
        return {"comparisons": artifact_service.list_baseline_comparisons(baseline_id, user)}
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    except AuthorisationError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e)) from e


@router.get("/artifact-types")
async def artifact_types(user: User = Depends(get_current_user)):
    return await AIEngineClient().artifact_types()


@router.post("/projects/{project_id}/generate", response_model=ArtifactOut, status_code=status.HTTP_201_CREATED)
async def generate(
    project_id: str,
    payload: GenerateRequest,
    artifact_service: ArtifactService = Depends(get_artifact_service),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        if payload.requirement_id:
            requirement = db.get(Requirement, payload.requirement_id)
            if not requirement or requirement.project_id != project_id:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requirement not found in this project")
            if requirement.review_status != "approved":
                raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                                    detail="Requirement must be approved before generation")
            if requirement.index_stale:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                                    detail="Requirement content changed and must be re-indexed before generation")
        return await artifact_service.generate(
            project_id=project_id,
            artifact_type=payload.artifact_type,
            requirement_text=payload.requirement_text,
            user=user,
            requirement_id=payload.requirement_id,
        )
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except AuthorisationError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))

    except ValidationError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))


@router.get("/projects/{project_id}/artifacts", response_model=list[ArtifactOut])
def list_artifacts(
    project_id: str,
    status_filter: str | None = Query(default=None, alias="status", pattern="^(backlog|todo|in_progress|in_review|blocked|done)$"),
    priority: str | None = Query(default=None, pattern="^(low|medium|high|critical)$"),
    category: str | None = Query(default=None, max_length=100),
    assigned_to: str | None = Query(default=None, max_length=36),
    artifact_service: ArtifactService = Depends(get_artifact_service),
    user: User = Depends(get_current_user),
):
    try:
        return artifact_service.list_for_project(project_id, user, status=status_filter,
                                                 priority=priority, category=category,
                                                 assigned_to=assigned_to)
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except AuthorisationError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))


@router.get("/artifacts/{artifact_id}", response_model=ArtifactOut)
def read_artifact(
    artifact_id: str,
    artifact_service: ArtifactService = Depends(get_artifact_service),
    user: User = Depends(get_current_user),
):
    try:
        return artifact_service.get(artifact_id, user)
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except AuthorisationError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))


@router.patch("/artifacts/{artifact_id}", response_model=ArtifactOut)
def update_artifact(
    artifact_id: str,
    payload: ArtifactUpdate,
    artifact_service: ArtifactService = Depends(get_artifact_service),
    user: User = Depends(get_current_user),
):
    try:
        updates = payload.model_dump(exclude_unset=True)
        return artifact_service.update(artifact_id, updates, user)
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except AuthorisationError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except ValidationError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))


@router.get("/artifacts/{artifact_id}/status-history")
def artifact_status_history(
    artifact_id: str,
    artifact_service: ArtifactService = Depends(get_artifact_service),
    user: User = Depends(get_current_user),
):
    try:
        return artifact_service.list_status_history(artifact_id, user)
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except AuthorisationError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))


@router.post("/artifacts/{artifact_id}/evaluations", status_code=status.HTTP_201_CREATED)
def evaluate_artifact(
    artifact_id: str,
    payload: EvaluationCreate,
    artifact_service: ArtifactService = Depends(get_artifact_service),
    user: User = Depends(get_current_user),
):
    try:
        item = artifact_service.evaluate(
            artifact_id=artifact_id,
            score=payload.score,
            feedback=payload.feedback,
            metrics=payload.metrics,
            user=user,
        )
        return {
            "id": item.id,
            "artifact_id": item.artifact_id,
            "score": item.score,
            "feedback": item.feedback,
            "metrics": item.metrics,
            "created_at": item.created_at,
        }
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except AuthorisationError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))


@router.get("/artifacts/{artifact_id}/evaluations")
def artifact_evaluations(
    artifact_id: str,
    artifact_service: ArtifactService = Depends(get_artifact_service),
    user: User = Depends(get_current_user),
):
    try:
        return artifact_service.list_evaluations(artifact_id, user)
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except AuthorisationError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))


@router.get("/artifacts/{artifact_id}/export")
def export_artifact(
    artifact_id: str,
    format: str = Query("json", pattern="^(?i)(json|markdown|md|csv|yaml|yml|gherkin)$"),
    artifact_service: ArtifactService = Depends(get_artifact_service),
    user: User = Depends(get_current_user),
):
    try:
        artifact = artifact_service.get(artifact_id, user)
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except AuthorisationError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))

    response = render_artifact_export(artifact, format)
    if response is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Gherkin export is only supported for acceptance_criteria artifacts",
        )
    return response


@router.post("/artifacts/{artifact_id}/export/backlog")
async def export_backlog_artifact(
    artifact_id: str,
    payload: BacklogExportRequest,
    artifact_service: ArtifactService = Depends(get_artifact_service),
    user: User = Depends(get_current_user),
):
    try:
        artifact = artifact_service.get(artifact_id, user)
    except ResourceNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except AuthorisationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    content = artifact.content or {}
    markdown = content.get("rendered_markdown") or content.get("markdown")
    if not markdown:
        markdown = json.dumps(content, ensure_ascii=False, indent=2)
    try:
        return await AIEngineClient().export_backlog_artifact(
            target=payload.target, title=artifact.title, markdown=markdown,
            dry_run=payload.dry_run, update_issue_id=payload.update_issue_id,
        )
    except HTTPException:
        raise


@router.get("/projects/{project_id}/artifacts/export.zip")
def export_project_artifacts_zip(
    project_id: str,
    artifact_service: ArtifactService = Depends(get_artifact_service),
    user: User = Depends(get_current_user),
):
    try:
        artifacts = artifact_service.list_for_project(project_id, user)
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except AuthorisationError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for artifact in artifacts:
            filename = f"{artifact.artifact_type}-{artifact.id}.json"
            archive.writestr(filename, json.dumps({
                "id": artifact.id, "project_id": artifact.project_id,
                "artifact_type": artifact.artifact_type, "title": artifact.title,
                "version": artifact.version, "content": artifact.content,
            }, indent=2))
    return Response(content=buffer.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="project-{project_id}-artifacts.zip"'})
