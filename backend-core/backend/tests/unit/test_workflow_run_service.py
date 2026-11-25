"""Unit tests for WorkflowRunRepository and WorkflowRunService."""
from __future__ import annotations

import asyncio
import uuid

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.domain.models import Project, ProjectMember, PromptVersion, User
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

    async def start_orchestrated_run(self, run_id: str, project_id: str, requirement_text: str,
                                     artifact_type: str = "user_story",
                                     prompt_overrides: dict[str, str] | None = None) -> dict:
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
            "usage": {"prompt_tokens": 12, "completion_tokens": 8, "total_tokens": 20},
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
            "usage": {"prompt_tokens": 22, "completion_tokens": 18, "total_tokens": 40},
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

    # Recreate the session and service to simulate an application restart after the PO pause.
    db.close()
    db = SessionLocal()
    repo = WorkflowRunRepository(db)
    service = WorkflowRunService(repo, _StubProjectService(), _FakeAIEngine())
    resumed = asyncio.run(service.resume_run(run_id=started["id"], user=user, resume_payload={"answers": {"q": "a"}}))
    assert resumed["status"] == "completed"
    assert resumed["final_artifact"]["rendered_markdown"] == "# Story"

    events_after = service.get_events(started["id"], user)
    assert [e["node_id"] for e in events_after] == ["orchestrator", "retrieve", "po_checkpoint", "composer"]
    assert len(repo.list_artifacts(started["id"])) == 2
    assert resumed["usage"]["total_tokens"] == 40
    assert service.metrics(project.id, user)["total_tokens"] == 40
    db.close()


def test_prompt_variant_assignment_is_stable_and_persisted():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    db = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    user = User(id=str(uuid.uuid4()), email="variants@example.com", full_name="PM", password_hash="x", role="member")
    project = Project(id=str(uuid.uuid4()), name="Demo", description="", owner_id=user.id)
    db.add_all([user, project])
    db.flush()
    db.add_all([
        PromptVersion(id=str(uuid.uuid4()), node_id="analyst", version="a", template="prompt A",
                      prompt_hash="a" * 64, experiment_id="exp-1", weight=50, enabled=True, created_by=user.id),
        PromptVersion(id=str(uuid.uuid4()), node_id="analyst", version="b", template="prompt B",
                      prompt_hash="b" * 64, experiment_id="exp-1", weight=50, enabled=True, created_by=user.id),
    ])
    db.commit()
    repo = WorkflowRunRepository(db)
    service = WorkflowRunService(repo, _StubProjectService(), _FakeAIEngine())
    selected, assignment = service._select_prompts("stable-run-id")
    selected_again, assignment_again = service._select_prompts("stable-run-id")
    assert selected == selected_again
    assert assignment == assignment_again
    assert assignment["analyst"]["experiment_id"] == "exp-1"
    assert selected["analyst"] in {"prompt A", "prompt B"}
    started = asyncio.run(service.start_run(project_id=project.id, user=user, requirement_text="Make a small change"))
    assert started["prompt_assignments"]["analyst"]["experiment_id"] == "exp-1"
    metrics = service.metrics(project.id, user)
    assert metrics["prompt_variant_metrics"][0]["run_count"] == 1
    assert metrics["prompt_variant_metrics"][0]["node_id"] == "analyst"
    db.close()
