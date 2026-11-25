"""AI Engine endpoints for orchestrated HITL artifact runs."""
from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.pipeline.orchestrated_graph import resume_orchestrated_pipeline, run_orchestrated_pipeline
from app.pipeline.llm_errors import LLMNodeFailure
from app.pipeline.secret_scan import scan_for_secrets

logger = logging.getLogger("sprintsmith.ai_engine.runs")

router = APIRouter(tags=["Orchestrated Runs"])


class RunStartRequest(BaseModel):
    run_id: str | None = None
    project_id: str
    requirement_text: str = Field(min_length=1)
    artifact_type: str = "user_story"
    model_alias: str | None = None
    retrieval_mode: str | None = None
    prompt_overrides: dict[str, str] = Field(default_factory=dict)


class RunResumeRequest(BaseModel):
    checkpoint: dict[str, Any]
    resume_payload: dict[str, Any] = Field(default_factory=dict)


@router.post("/runs/start")
def start_run(req: RunStartRequest) -> dict[str, Any]:
    run_id = req.run_id or f"run_{uuid.uuid4().hex}"
    findings = scan_for_secrets(req.requirement_text)
    if findings:
        raise HTTPException(status_code=422, detail={"message": "Requirement contains possible credentials; redact or rotate them before submission.", "findings": findings})
    try:
        return run_orchestrated_pipeline(
            run_id=run_id,
            project_id=req.project_id,
            requirement_text=req.requirement_text,
            artifact_type=req.artifact_type,
            model_alias=req.model_alias,
            retrieval_mode=req.retrieval_mode,
            prompt_overrides=req.prompt_overrides,
        )
    except Exception as exc:
        logger.exception("Orchestrated run start failed for run_id=%s", run_id)
        if isinstance(exc, LLMNodeFailure):
            raise HTTPException(status_code=502, detail=exc.detail) from exc
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/runs/resume")
def resume_run(req: RunResumeRequest) -> dict[str, Any]:
    try:
        return resume_orchestrated_pipeline(
            checkpoint=req.checkpoint,
            resume_payload=req.resume_payload,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Orchestrated run resume failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
