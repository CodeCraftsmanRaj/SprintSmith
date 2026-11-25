"""
Artifact generation, update, export, and evaluation business logic.
"""

import json
import uuid

from sqlalchemy import select

from app.core.exceptions import ResourceNotFoundError, ValidationError
from app.domain.models import Artifact, ArtifactStatusHistory, Evaluation, GenerationHistory, User
from app.repositories.artifact_repo import ArtifactRepository
from app.repositories.audit_repo import AuditRepository
from app.services.ai_engine import AIEngineClient
from app.services.project_service import ProjectService


class ArtifactService:
    def __init__(
        self,
        artifact_repo: ArtifactRepository,
        audit_repo: AuditRepository,
        project_service: ProjectService,
        ai_client: AIEngineClient,
    ):
        self.artifact_repo = artifact_repo
        self.audit_repo = audit_repo
        self.project_service = project_service
        self.ai_client = ai_client

    # ── Helpers ─────────────────────────────────────────────────────────

    def _get_artifact_or_fail(self, artifact_id: str) -> Artifact:
        artifact = self.artifact_repo.get(artifact_id)
        if not artifact:
            raise ResourceNotFoundError("Artifact", artifact_id)
        return artifact

    # ── Generation ──────────────────────────────────────────────────────

    async def generate(
        self,
        project_id: str,
        artifact_type: str,
        requirement_text: str,
        user: User,
        requirement_id: str | None = None,
    ) -> Artifact:
        self.project_service.get_project_or_fail(project_id, user, write=True)

        result = await self.ai_client.generate(project_id, artifact_type, requirement_text)
        if not isinstance(result, dict) or not isinstance(result.get("output"), dict):
            raise ValidationError(
                "AI engine returned an invalid artifact payload. Please try generating again."
            )
        content = result["output"]

        artifact = Artifact(
            id=self.artifact_repo.new_id(),
            project_id=project_id,
            created_by=user.id,
            artifact_type=result.get("artifact_type", artifact_type),
            title=f"{artifact_type.replace('_', ' ').title()}",
            content=content,
        )
        self.artifact_repo.add(artifact)
        self.artifact_repo.flush()

        history = GenerationHistory(
            id=self.artifact_repo.new_id(),
            project_id=project_id,
            artifact_id=artifact.id,
            user_id=user.id,
            engine_request_id=result.get("request_id", ""),
            artifact_type=artifact.artifact_type,
            prompt_version=result.get("prompt_version", ""),
            usage=result.get("usage") or {},
            latency_ms=result.get("latency_ms", 0),
            requirement_text=requirement_text,
            requirement_id=requirement_id,
            eval_score=result.get("eval_score"),
            retry_count=result.get("retry_count", 0),
            model_used=result.get("model_used"),
        )
        self.artifact_repo.add_history(history)

        self.audit_repo.record(
            user.id,
            "artifact.generate",
            "artifact",
            artifact.id,
            {
                "request_id": history.engine_request_id,
                "prompt_version": history.prompt_version,
                "usage": history.usage,
                "latency_ms": history.latency_ms,
            },
        )
        self.artifact_repo.commit()
        return self.artifact_repo.refresh(artifact)

    # ── Read / List ─────────────────────────────────────────────────────

    def list_for_project(self, project_id: str, user: User, *, status: str | None = None,
                         priority: str | None = None, category: str | None = None,
                         assigned_to: str | None = None) -> list[Artifact]:
        self.project_service.get_project_or_fail(project_id, user)
        return self.artifact_repo.list_for_project(project_id, status=status, priority=priority,
                                                   category=category, assigned_to=assigned_to)

    def get(self, artifact_id: str, user: User) -> Artifact:
        artifact = self._get_artifact_or_fail(artifact_id)
        self.project_service.get_project_or_fail(artifact.project_id, user)
        return artifact

    # ── Update ──────────────────────────────────────────────────────────

    def update(self, artifact_id: str, updates: dict, user: User) -> Artifact:
        artifact = self._get_artifact_or_fail(artifact_id)
        self.project_service.get_project_or_fail(artifact.project_id, user, write=True)

        if "assigned_to" in updates and updates["assigned_to"] is not None:
            assignee = self.artifact_repo.db.get(User, updates["assigned_to"])
            if not assignee or not assignee.is_active:
                raise ValidationError("Assigned user does not exist or is disabled")
            self.project_service.get_project_or_fail(artifact.project_id, assignee)
        if "parent_artifact_ids" in updates:
            parent_ids = updates["parent_artifact_ids"] or []
            if artifact.id in parent_ids:
                raise ValidationError("An artifact cannot depend on itself")
            parents = self.artifact_repo.db.scalars(select(Artifact).where(
                Artifact.project_id == artifact.project_id, Artifact.id.in_(parent_ids)
            )).all() if parent_ids else []
            if len(parents) != len(set(parent_ids)):
                raise ValidationError("Dependencies must reference artifacts in the same project")
            existing = {row.id: set(row.parent_artifact_ids or []) for row in
                        self.artifact_repo.db.scalars(select(Artifact).where(
                            Artifact.project_id == artifact.project_id)).all()}
            existing[artifact.id] = set(parent_ids)
            def reaches(start: str, target: str, visited: set[str]) -> bool:
                if start == target:
                    return True
                if start in visited:
                    return False
                visited.add(start)
                return any(reaches(child, target, visited) for child in existing.get(start, set()))
            if any(reaches(parent_id, artifact.id, set()) for parent_id in parent_ids):
                raise ValidationError("Artifact dependencies cannot contain a cycle")

        previous_status = artifact.status
        for key, value in updates.items():
            if value is not None or key in {"assigned_to", "category"}:
                setattr(artifact, key, value)
        artifact.version += 1
        if "status" in updates and updates["status"] != previous_status:
            self.artifact_repo.db.add(ArtifactStatusHistory(
                id=self.artifact_repo.new_id(), artifact_id=artifact.id, changed_by=user.id,
                previous_status=previous_status, status=updates["status"],
            ))

        # Any artifact that explicitly depends on this artifact is now stale.
        db = self.artifact_repo.db
        dependents = db.scalars(select(Artifact).where(Artifact.project_id == artifact.project_id)).all()
        for dependent in dependents:
            if artifact.id in (dependent.parent_artifact_ids or []):
                dependent.is_stale = True

        self.audit_repo.record(
            user.id, "artifact.update", "artifact", artifact.id, {"version": artifact.version}
        )
        self.artifact_repo.commit()
        return self.artifact_repo.refresh(artifact)

    def list_status_history(self, artifact_id: str, user: User) -> list[dict]:
        artifact = self.get(artifact_id, user)
        rows = self.artifact_repo.db.scalars(select(ArtifactStatusHistory).where(
            ArtifactStatusHistory.artifact_id == artifact.id
        ).order_by(ArtifactStatusHistory.created_at.desc())).all()
        return [{"id": row.id, "changed_by": row.changed_by,
                 "previous_status": row.previous_status, "status": row.status,
                 "created_at": row.created_at} for row in rows]

    # ── History ─────────────────────────────────────────────────────────

    def list_history(self, project_id: str, user: User) -> list[dict]:
        self.project_service.get_project_or_fail(project_id, user)
        entries = self.artifact_repo.list_history(project_id)
        return [
            {
                "id": h.id,
                "artifact_id": h.artifact_id,
                "artifact_type": h.artifact_type,
                "engine_request_id": h.engine_request_id,
                "prompt_version": h.prompt_version,
                "usage": h.usage,
                "latency_ms": h.latency_ms,
                "requirement_id": h.requirement_id,
                "eval_score": h.eval_score,
                "retry_count": h.retry_count,
                "model_used": h.model_used,
                "created_at": h.created_at,
            }
            for h in entries
        ]

    # ── Export ───────────────────────────────────────────────────────────

    def export_json(self, artifact_id: str, user: User) -> str:
        artifact = self.get(artifact_id, user)
        return json.dumps(
            {
                "id": artifact.id,
                "project_id": artifact.project_id,
                "artifact_type": artifact.artifact_type,
                "title": artifact.title,
                "version": artifact.version,
                "content": artifact.content,
            },
            indent=2,
        )

    # ── Evaluations ─────────────────────────────────────────────────────

    def evaluate(
        self, artifact_id: str, score: int, feedback: str, metrics: dict, user: User
    ) -> Evaluation:
        artifact = self._get_artifact_or_fail(artifact_id)
        self.project_service.get_project_or_fail(artifact.project_id, user, write=True)

        item = Evaluation(
            id=self.artifact_repo.new_id(),
            artifact_id=artifact_id,
            user_id=user.id,
            score=score,
            feedback=feedback,
            metrics=metrics,
        )
        self.artifact_repo.add_evaluation(item)
        self.audit_repo.record(
            user.id, "artifact.evaluate", "artifact", artifact_id, {"score": score}
        )
        self.artifact_repo.commit()
        return item

    def list_evaluations(self, artifact_id: str, user: User) -> list[dict]:
        artifact = self._get_artifact_or_fail(artifact_id)
        self.project_service.get_project_or_fail(artifact.project_id, user)
        items = self.artifact_repo.list_evaluations(artifact_id)
        return [
            {
                "id": x.id,
                "user_id": x.user_id,
                "score": x.score,
                "feedback": x.feedback,
                "metrics": x.metrics,
                "created_at": x.created_at,
            }
            for x in items
        ]
