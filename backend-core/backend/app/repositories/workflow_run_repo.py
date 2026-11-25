"""Repository for durable WorkflowRun, RunEvent, and RunArtifact persistence."""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.models import RunArtifact, RunEvent, WorkflowRun


class WorkflowRunRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create_run(
        self,
        *,
        project_id: str,
        user_id: str,
        goal: str,
        artifact_type: str = "user_story",
        requirement_id: str | None = None,
        run_id: str | None = None,
    ) -> WorkflowRun:
        run = WorkflowRun(
            id=run_id or str(uuid.uuid4()),
            project_id=project_id,
            user_id=user_id,
            requirement_id=requirement_id,
            artifact_type=artifact_type,
            goal=goal,
            status="created",
        )
        self.db.add(run)
        self.db.commit()
        self.db.refresh(run)
        return run

    def get_run(self, run_id: str) -> WorkflowRun | None:
        return self.db.get(WorkflowRun, run_id)

    def list_runs(self, project_id: str, limit: int = 1000) -> list[WorkflowRun]:
        stmt = (
            select(WorkflowRun)
            .where(WorkflowRun.project_id == project_id)
            .order_by(WorkflowRun.created_at.desc())
            .limit(limit)
        )
        return list(self.db.scalars(stmt).all())

    def update_run(
        self,
        run: WorkflowRun,
        *,
        status: str,
        paused_node_id: str | None = None,
        checkpoint: dict[str, Any] | None = None,
        human_review_packet: dict[str, Any] | None = None,
        final_artifact: dict[str, Any] | None = None,
        current_node: str | None = None,
        final_report: dict[str, Any] | None = None,
        started_at: Any = None,
        completed_at: Any = None,
        usage: dict[str, Any] | None = None,
        latency_ms: int | None = None,
        error_message: str | None = None,
    ) -> WorkflowRun:
        run.status = status
        run.current_node = current_node
        if final_report is not None:
            run.final_report = final_report
        if started_at is not None and run.started_at is None:
            run.started_at = started_at
        if completed_at is not None:
            run.completed_at = completed_at
        if usage is not None:
            run.usage = usage
        if latency_ms is not None:
            run.latency_ms = latency_ms
        run.paused_node_id = paused_node_id
        run.checkpoint = checkpoint
        run.human_review_packet = human_review_packet
        if final_artifact is not None:
            run.final_artifact = final_artifact
        run.error_message = error_message
        self.db.add(run)
        self.db.commit()
        self.db.refresh(run)
        return run

    def append_events(self, run_id: str, events: list[dict[str, Any]]) -> list[RunEvent]:
        rows: list[RunEvent] = []
        for evt in events:
            row = RunEvent(
                id=str(evt.get("event_id") or f"evt_{uuid.uuid4().hex[:12]}"),
                run_id=run_id,
                node_id=str(evt.get("node_id") or "unknown"),
                agent=str(evt.get("agent") or "unknown"),
                status=str(evt.get("status") or "completed"),
                content=str(evt.get("content") or ""),
                data=dict(evt.get("data") or {}),
            )
            self.db.add(row)
            rows.append(row)
        self.db.commit()
        return rows

    def list_events(self, run_id: str) -> list[RunEvent]:
        stmt = (
            select(RunEvent)
            .where(RunEvent.run_id == run_id)
            .order_by(RunEvent.created_at.asc())
        )
        return list(self.db.scalars(stmt).all())

    def save_artifact(
        self,
        *,
        run_id: str,
        artifact_type: str,
        name: str,
        content: dict[str, Any],
    ) -> RunArtifact:
        existing = self.db.scalars(select(RunArtifact).where(
            RunArtifact.run_id == run_id,
            RunArtifact.artifact_type == artifact_type,
            RunArtifact.name == name,
        )).first()
        if existing:
            existing.content = content
            self.db.commit()
            self.db.refresh(existing)
            return existing
        row = RunArtifact(
            id=str(uuid.uuid4()),
            run_id=run_id,
            artifact_type=artifact_type,
            name=name,
            content=content,
        )
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return row

    def list_artifacts(self, run_id: str) -> list[RunArtifact]:
        stmt = (
            select(RunArtifact)
            .where(RunArtifact.run_id == run_id)
            .order_by(RunArtifact.created_at.asc())
        )
        return list(self.db.scalars(stmt).all())
