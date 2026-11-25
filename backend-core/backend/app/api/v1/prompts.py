import hashlib
import uuid

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


@router.post("/orchestration/{node_id}/versions", status_code=201)
def create_orchestration_prompt(node_id: str, payload: OrchestrationPromptCreate,
                                db: Session = Depends(get_db),
                                user: User = Depends(require_role("admin"))):
    if node_id not in {"analyst", "story_writer", "ac_generator", "test_case_writer",
                       "api_spec", "architecture", "sprint_plan"}:
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
