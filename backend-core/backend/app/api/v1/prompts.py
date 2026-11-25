import hashlib
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_role
from app.domain.models import GenerationHistory, PromptVersion, User
from app.services.ai_engine import AIEngineClient

router = APIRouter(prefix="/prompts", tags=["Prompts"])


class OrchestrationPromptCreate(BaseModel):
    version: str = Field(min_length=1, max_length=80)
    template: str = Field(min_length=1, max_length=20000)
    experiment_id: str | None = Field(default=None, max_length=80)
    weight: int = Field(default=100, ge=0, le=100)
    enabled: bool = True


class OrchestrationPromptImportItem(BaseModel):
    node_id: str = Field(min_length=1, max_length=80)
    version: str = Field(min_length=1, max_length=80)
    template: str = Field(min_length=1, max_length=20000)
    experiment_id: str | None = Field(default=None, max_length=80)
    weight: int = Field(default=100, ge=0, le=100)
    enabled: bool = True


class OrchestrationPromptImportBundle(BaseModel):
    schema_version: Literal[1] = 1
    prompts: list[OrchestrationPromptImportItem] = Field(min_length=1, max_length=500)


_ORCHESTRATION_NODES = {
    "analyst", "story_writer", "ac_generator", "test_case_writer",
    "api_spec", "architecture", "sprint_plan",
}


@router.get("/executions")
def prompt_execution_history(
    limit: int = Query(default=100, ge=1, le=500),
    artifact_type: str | None = Query(default=None, max_length=80),
    prompt_version: str | None = Query(default=None, max_length=100),
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin")),
):
    """Recent prompt-backed generation runs, newest first."""
    stmt = select(GenerationHistory).order_by(GenerationHistory.created_at.desc())
    if artifact_type:
        stmt = stmt.where(GenerationHistory.artifact_type == artifact_type)
    if prompt_version:
        stmt = stmt.where(GenerationHistory.prompt_version == prompt_version)
    rows = db.scalars(stmt.limit(limit)).all()
    return {"executions": [
        {
            "id": row.id,
            "project_id": row.project_id,
            "artifact_id": row.artifact_id,
            "user_id": row.user_id,
            "requirement_id": row.requirement_id,
            "artifact_type": row.artifact_type,
            "prompt_version": row.prompt_version,
            "usage": row.usage or {},
            "latency_ms": row.latency_ms,
            "eval_score": row.eval_score,
            "retry_count": row.retry_count,
            "model_used": row.model_used,
            "created_at": row.created_at,
        }
        for row in rows
    ]}


@router.get("/analytics")
def prompt_performance_analytics(
    artifact_type: str | None = Query(default=None, max_length=80),
    prompt_version: str | None = Query(default=None, max_length=100),
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin")),
):
    """Aggregate latency, judge score, retries, and token usage by prompt version."""
    stmt = select(GenerationHistory)
    if artifact_type:
        stmt = stmt.where(GenerationHistory.artifact_type == artifact_type)
    if prompt_version:
        stmt = stmt.where(GenerationHistory.prompt_version == prompt_version)

    groups: dict[tuple[str, str], dict] = {}
    for row in db.scalars(stmt).all():
        key = (row.artifact_type, row.prompt_version)
        group = groups.setdefault(key, {
            "artifact_type": row.artifact_type,
            "prompt_version": row.prompt_version,
            "execution_count": 0,
            "latency_ms_total": 0,
            "eval_score_total": 0.0,
            "eval_score_count": 0,
            "retry_count_total": 0,
            "input_tokens_total": 0,
            "output_tokens_total": 0,
        })
        group["execution_count"] += 1
        group["latency_ms_total"] += row.latency_ms or 0
        group["retry_count_total"] += row.retry_count or 0
        if row.eval_score is not None:
            group["eval_score_total"] += row.eval_score
            group["eval_score_count"] += 1
        usage = row.usage or {}
        group["input_tokens_total"] += int(usage.get("input_tokens", 0) or 0)
        group["output_tokens_total"] += int(usage.get("output_tokens", 0) or 0)

    analytics = []
    for group in groups.values():
        count = group["execution_count"]
        score_count = group.pop("eval_score_count")
        score_total = group.pop("eval_score_total")
        group["average_latency_ms"] = round(group["latency_ms_total"] / count, 2)
        group["average_eval_score"] = round(score_total / score_count, 4) if score_count else None
        group["average_retries"] = round(group["retry_count_total"] / count, 2)
        analytics.append(group)
    analytics.sort(key=lambda row: (row["artifact_type"], row["prompt_version"]))
    return {"analytics": analytics}


@router.post("/orchestration/{node_id}/versions", status_code=201)
def create_orchestration_prompt(node_id: str, payload: OrchestrationPromptCreate,
                                db: Session = Depends(get_db),
                                user: User = Depends(require_role("admin"))):
    if node_id not in _ORCHESTRATION_NODES:
        raise HTTPException(status_code=422, detail="Unsupported orchestration node")
    if payload.experiment_id and payload.weight not in range(1, 101):
        raise HTTPException(status_code=422, detail="Experiment variant weight must be 1..100")
    prompt_hash = hashlib.sha256(payload.template.encode()).hexdigest()
    row = PromptVersion(id=str(uuid.uuid4()), node_id=node_id, version=payload.version,
                        template=payload.template, prompt_hash=prompt_hash,
                        experiment_id=payload.experiment_id, weight=payload.weight,
                        enabled=payload.enabled, created_by=user.id)
    db.add(row)
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Prompt version already exists or is invalid") from exc
    return {"id": row.id, "node_id": row.node_id, "version": row.version,
            "prompt_hash": row.prompt_hash, "experiment_id": row.experiment_id,
            "weight": row.weight, "enabled": row.enabled}


@router.get("/orchestration/export")
def export_orchestration_prompts(db: Session = Depends(get_db),
                                 user: User = Depends(require_role("admin"))):
    """Export all orchestration prompt versions as a portable JSON bundle."""
    rows = db.query(PromptVersion).order_by(PromptVersion.node_id, PromptVersion.created_at,
                                           PromptVersion.version).all()
    return {
        "schema_version": 1,
        "prompts": [
            {"node_id": row.node_id, "version": row.version, "template": row.template,
             "experiment_id": row.experiment_id, "weight": row.weight, "enabled": row.enabled,
             "prompt_hash": row.prompt_hash}
            for row in rows
        ],
    }


@router.post("/orchestration/import", status_code=201)
def import_orchestration_prompts(payload: OrchestrationPromptImportBundle,
                                 db: Session = Depends(get_db),
                                 user: User = Depends(require_role("admin"))):
    """Import a version bundle atomically; existing node/version pairs are rejected."""
    invalid_nodes = sorted({item.node_id for item in payload.prompts
                            if item.node_id not in _ORCHESTRATION_NODES})
    if invalid_nodes:
        raise HTTPException(status_code=422,
                            detail=f"Unsupported orchestration node(s): {', '.join(invalid_nodes)}")
    if any(item.experiment_id and item.weight == 0 for item in payload.prompts):
        raise HTTPException(status_code=422, detail="Experiment variant weight must be 1..100")
    pairs = [(item.node_id, item.version) for item in payload.prompts]
    if len(pairs) != len(set(pairs)):
        raise HTTPException(status_code=422, detail="Bundle contains duplicate node/version pairs")

    rows = [PromptVersion(
        id=str(uuid.uuid4()), node_id=item.node_id, version=item.version,
        template=item.template, prompt_hash=hashlib.sha256(item.template.encode()).hexdigest(),
        experiment_id=item.experiment_id, weight=item.weight, enabled=item.enabled,
        created_by=user.id,
    ) for item in payload.prompts]
    db.add_all(rows)
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=409,
                            detail="One or more prompt versions already exist or could not be imported") from exc
    return {"imported": len(rows), "prompt_ids": [row.id for row in rows]}


@router.get("/orchestration/{node_id}/versions")
def list_orchestration_prompts(node_id: str, db: Session = Depends(get_db),
                               user: User = Depends(get_current_user)):
    rows = db.query(PromptVersion).filter(PromptVersion.node_id == node_id).order_by(
        PromptVersion.created_at.desc()).all()
    return {"versions": [{"id": row.id, "node_id": row.node_id, "version": row.version,
                          "prompt_hash": row.prompt_hash, "experiment_id": row.experiment_id,
                          "weight": row.weight, "enabled": row.enabled,
                          "created_at": row.created_at.isoformat() if row.created_at else None}
                         for row in rows]}


@router.get("")
async def list_prompts(user: User = Depends(get_current_user)):
    return await AIEngineClient()._request("GET", "/prompts")


@router.get("/export")
async def export_artifact_prompt_bundle(user: User = Depends(require_role("admin"))):
    return await AIEngineClient()._request("GET", "/prompts/export")


@router.post("/import", status_code=201)
async def import_artifact_prompt_bundle(payload: dict,
                                        user: User = Depends(require_role("admin"))):
    return await AIEngineClient()._request("POST", "/prompts/import", json=payload)


@router.get("/{artifact_type}")
async def read_prompt(artifact_type: str, version: str = Query("latest"),
                      user: User = Depends(get_current_user)):
    return await AIEngineClient()._request("GET", f"/prompts/{artifact_type}",
                                           params={"version": version})


@router.post("/{artifact_type}", status_code=201)
async def create_prompt_version(artifact_type: str, payload: dict,
                                user: User = Depends(require_role("admin"))):
    return await AIEngineClient()._request("POST", f"/prompts/{artifact_type}", json=payload)


@router.post("/{artifact_type}/test")
async def test_prompt(artifact_type: str, payload: dict,
                      user: User = Depends(require_role("admin"))):
    return await AIEngineClient()._request("POST", f"/prompts/{artifact_type}/test", json=payload)
