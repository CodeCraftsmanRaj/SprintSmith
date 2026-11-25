"""Unit tests for WorkflowRunRepository and WorkflowRunService."""
from __future__ import annotations

import asyncio
import uuid

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.domain.models import Project, ProjectMember, User
from app.ports.ai_engine_port import AIEnginePort
from app.repositories.workflow_run_repo import WorkflowRunRepository
from app.services.workflow_run_service import WorkflowRunService


class _StubProjectService:
    def get_project_or_fail(self, project_id: str, user: User, write: bool = False):
        return None


class _FakeAIEngine(AIEnginePort):
    async def generate(self, project_id: str, artifact_type: str, requirement_text: str) -> dict:
        return {}

    async def ingest(self, file_path: str, project_id: str, doc_type: str, doc_id: str | None = None) -> dict:
        return {}

    async def ingest_status(self, engine_job_id: str) -> dict:
        return {}

    async def artifact_types(self) -> dict:
        return {}

    async def stream_generate(self, project_id: str, artifact_type: str, requirement_text: str):
        if False:
            yield b""

    async def generate_compare(self, project_id: str, artifact_type: str, requirement_text: str) -> dict:
        return {}

    async def evaluate_batch(self, project_id: str | None = None, retrieval_mode: str = "vector") -> dict:
        return {}

    async def start_orchestrated_run(self, run_id: str, project_id: str, requirement_text: str, artifact_type: str = "user_story") -> dict:
        return {
            "run_id": run_id,
            "project_id": project_id,
            "status": "waiting_review",
            "paused_node_id": "po_checkpoint",
            "human_review_packet": {"node_id": "po_checkpoint", "mode": "deep"},
            "checkpoint": {"paused_node_id": "po_checkpoint", "state": {"requirement_text": requirement_text}},
            "events": [
                {"event_id": "evt-1", "node_id": "retrieve", "agent": "retriever", "status": "completed", "content": "ok"},
                {"event_id": "evt-2", "node_id": "po_checkpoint", "agent": "human_reviewer", "status": "waiting_review", "content": "paused"},
            ],
            "final_artifact": {},
        }

    async def resume_orchestrated_run(self, checkpoint: dict, resume_payload: dict) -> dict:
        return {
            "status": "completed",
            "paused_node_id": None,
            "human_review_packet": None,
            "checkpoint": None,
            "events": [
                {"event_id": "evt-3", "node_id": "composer", "agent": "composer", "status": "completed", "content": "done"},
            ],
            "final_artifact": {"mode": "deep", "rendered_markdown": "# Story"},
        }


def test_workflow_run_lifecycle_start_events_and_resume():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    db = SessionLocal()

    user = User(id=str(uuid.uuid4()), email="pm@example.com", full_name="PM", password_hash="x", role="member")
    project = Project(id=str(uuid.uuid4()), name="Demo", description="", owner_id=user.id)
    db.add_all([user, project, ProjectMember(id=str(uuid.uuid4()), project_id=project.id, user_id=user.id, role="owner")])
    db.commit()

    repo = WorkflowRunRepository(db)
    service = WorkflowRunService(repo, _StubProjectService(), _FakeAIEngine())

    started = asyncio.run(service.start_run(project_id=project.id, user=user, requirement_text="Add SSO"))
    assert started["status"] == "waiting_review"
    assert started["paused_node_id"] == "po_checkpoint"

    events_before = service.get_events(started["id"], user)
    assert [e["node_id"] for e in events_before] == ["orchestrator", "retrieve", "po_checkpoint"]

    resumed = asyncio.run(service.resume_run(run_id=started["id"], user=user, resume_payload={"answers": {"q": "a"}}))
    assert resumed["status"] == "completed"
    assert resumed["final_artifact"]["rendered_markdown"] == "# Story"

    events_after = service.get_events(started["id"], user)
    assert [e["node_id"] for e in events_after] == ["orchestrator", "retrieve", "po_checkpoint", "composer"]
    assert len(repo.list_artifacts(started["id"])) == 2
    db.close()
