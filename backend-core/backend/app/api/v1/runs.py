"""Backend API routes for durable orchestrated workflow runs."""
from __future__ import annotations

from typing import Any
import asyncio
import json

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, get_project_service
from app.domain.models import User
from app.repositories.workflow_run_repo import WorkflowRunRepository
from app.services.ai_engine import AIEngineClient
from app.services.project_service import ProjectService
from app.services.workflow_run_service import WorkflowRunService

router = APIRouter(tags=["Workflow Runs"])


class StartWorkflowRunRequest(BaseModel):
    requirement_text: str = Field(min_length=1)
    artifact_type: str = "user_story"
    requirement_id: str | None = None


class ResumeWorkflowRunRequest(BaseModel):
    answers: dict[str, str] | None = None
    selected_stories: list[dict[str, Any]] | None = None
    accepted: bool | None = None
    title: str | None = None
    story: str | None = None
    objective: str | None = None


def _run_service(
    db: Session = Depends(get_db),
    project_service: ProjectService = Depends(get_project_service),
) -> WorkflowRunService:
    return WorkflowRunService(
        WorkflowRunRepository(db),
        project_service,
        AIEngineClient(),
    )


@router.post("/projects/{project_id}/runs", status_code=201)
async def start_workflow_run(
    project_id: str,
    payload: StartWorkflowRunRequest,
    service: WorkflowRunService = Depends(_run_service),
    user: User = Depends(get_current_user),
):
    try:
        return await service.start_run(
            project_id=project_id,
            user=user,
            requirement_text=payload.requirement_text,
            artifact_type=payload.artifact_type,
            requirement_id=payload.requirement_id,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=403, detail="Access denied") from exc


@router.get("/projects/{project_id}/runs")
def list_workflow_runs(
    project_id: str,
    service: WorkflowRunService = Depends(_run_service),
    user: User = Depends(get_current_user),
):
    try:
        return {"runs": service.list_runs(project_id, user)}
    except Exception as exc:
        raise HTTPException(status_code=403, detail="Access denied") from exc


@router.get("/projects/{project_id}/runs/metrics")
def workflow_run_metrics(project_id: str, service: WorkflowRunService = Depends(_run_service),
                         user: User = Depends(get_current_user)):
    try:
        return service.metrics(project_id, user)
    except Exception as exc:
        raise HTTPException(status_code=403, detail="Access denied") from exc


@router.get("/runs/{run_id}")
def get_workflow_run(
    run_id: str,
    service: WorkflowRunService = Depends(_run_service),
    user: User = Depends(get_current_user),
):
    try:
        return service.get_run(run_id, user)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=403, detail="Access denied") from exc


@router.get("/runs/{run_id}/events")
def get_workflow_run_events(
    run_id: str,
    service: WorkflowRunService = Depends(_run_service),
    user: User = Depends(get_current_user),
):
    try:
        return {"events": service.get_events(run_id, user)}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=403, detail="Access denied") from exc


@router.get("/runs/{run_id}/stream")
async def stream_workflow_run_events(
    run_id: str,
    service: WorkflowRunService = Depends(_run_service),
    user: User = Depends(get_current_user),
    last_event_id: str | None = Header(default=None, alias="Last-Event-ID"),
):
    """SSE event log for reconnecting clients; emits persisted events by event id."""
    try:
        run = service.get_run(run_id, user)  # checks project access before streaming
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=403, detail="Access denied") from exc

    async def event_stream():
        seen: set[str] = set()
        if last_event_id:
            initial_events = service.run_repo.list_events(run_id)
            for event in initial_events:
                seen.add(event.id)
                if event.id == last_event_id:
                    break
            if last_event_id not in seen:
                seen.clear()
        while True:
            events = service.run_repo.list_events(run_id)
            for event in events:
                if event.id in seen:
                    continue
                body = {"id": event.id, "run_id": event.run_id, "node_id": event.node_id,
                        "agent": event.agent, "status": event.status, "content": event.content,
                        "data": event.data, "created_at": event.created_at.isoformat() if event.created_at else None}
                yield f"id: {event.id}\ndata: {json.dumps(body, default=str)}\n\n"
                seen.add(event.id)
            current = service.get_run(run_id, user)
            if current["status"] in {"completed", "failed"}:
                break
            yield ": keep-alive\n\n"
            await asyncio.sleep(1)

    return StreamingResponse(event_stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/runs/{run_id}/resume")
async def resume_workflow_run(
    run_id: str,
    payload: ResumeWorkflowRunRequest,
    service: WorkflowRunService = Depends(_run_service),
    user: User = Depends(get_current_user),
):
    try:
        return await service.resume_run(
            run_id=run_id,
            user=user,
            resume_payload=payload.model_dump(exclude_none=True),
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=403, detail="Access denied") from exc


@router.post("/runs/{run_id}/approve")
async def approve_workflow_run(run_id: str, payload: ResumeWorkflowRunRequest,
                               service: WorkflowRunService = Depends(_run_service),
                               user: User = Depends(get_current_user)):
    return await resume_workflow_run(run_id, payload, service, user)


@router.post("/runs/{run_id}/revise")
async def revise_workflow_run(run_id: str, payload: ResumeWorkflowRunRequest,
                              service: WorkflowRunService = Depends(_run_service),
                              user: User = Depends(get_current_user)):
    return await resume_workflow_run(run_id, payload, service, user)


@router.post("/runs/{run_id}/reject")
def reject_workflow_run(run_id: str, service: WorkflowRunService = Depends(_run_service),
                        user: User = Depends(get_current_user)):
    try:
        return service.reject_run(run_id, user)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=403, detail="Access denied") from exc
