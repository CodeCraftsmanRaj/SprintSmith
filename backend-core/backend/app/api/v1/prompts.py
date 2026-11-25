import hashlib
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_role
from app.domain.models import PromptVersion, User
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
