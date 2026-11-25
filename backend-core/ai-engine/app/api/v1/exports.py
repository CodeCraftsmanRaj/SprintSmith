"""Backlog exporter endpoint used by the authenticated SprintSmith gateway."""
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.exporters.base import ExportConfigError, ExportResult, make_exporter
from app.pipeline.secret_scan import inspect_sensitive_text

router = APIRouter(tags=["Exporters"])


class ArtifactExportRequest(BaseModel):
    target: Any
    title: str = Field(min_length=1, max_length=255)
    markdown: str = Field(max_length=100_000)
    dry_run: bool = False
    update_issue_id: str | None = None


@router.post("/export", response_model=ExportResult)
def export_artifact(req: ArtifactExportRequest):
    try:
        inspect_sensitive_text(req.markdown)
        from app.exporters.base import ExportTarget
        target = ExportTarget.model_validate(req.target)
        exporter = make_exporter(target.backend)
        if req.update_issue_id:
            return exporter.update_issue(req.update_issue_id, req.markdown, target,
                                         title=req.title, dry_run=req.dry_run)
        return exporter.export(req.markdown, target, title=req.title, dry_run=req.dry_run)
    except (ExportConfigError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Backlog exporter failed") from exc
