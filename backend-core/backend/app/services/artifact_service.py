"""
Artifact generation, update, export, and evaluation business logic.
"""

import json
import uuid
import re
from difflib import SequenceMatcher

from sqlalchemy import select
from sqlalchemy.orm.exc import StaleDataError

from app.core.exceptions import ConflictError, ResourceNotFoundError, ValidationError
from app.domain.models import (Artifact, ArtifactStatusHistory, BaselineComparison, Evaluation,
                               EvaluationBaseline, GenerationHistory, User)
from app.repositories.artifact_repo import ArtifactRepository
from app.repositories.audit_repo import AuditRepository
from app.services.ai_engine import AIEngineClient
from app.services.openapi_spec import OpenAPIValidationError, to_openapi_spec
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
        if artifact_type == "api_spec":
            try:
                content = to_openapi_spec(content, title=f"{project_id} API")
            except OpenAPIValidationError as exc:
                raise ValidationError(f"AI engine returned an invalid OpenAPI specification: {exc}") from exc

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
        updates = dict(updates)
        expected_version = updates.pop("expected_version", None)
        if expected_version is not None and expected_version != artifact.version:
            raise ConflictError(f"Artifact has changed; current version is {artifact.version}")

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
        if "status" in updates and updates["status"] != previous_status:
            self.artifact_repo.db.add(ArtifactStatusHistory(
                id=self.artifact_repo.new_id(), artifact_id=artifact.id, changed_by=user.id,
                previous_status=previous_status, status=updates["status"],
            ))

        # Any artifact that explicitly depends on this artifact is now stale.
        db = self.artifact_repo.db
        try:
            dependents = db.scalars(select(Artifact).where(
                Artifact.project_id == artifact.project_id
            )).all()
        except StaleDataError as exc:
            self.artifact_repo.rollback()
            raise ConflictError("Artifact was updated by another user; reload and retry") from exc
        for dependent in dependents:
            if artifact.id in (dependent.parent_artifact_ids or []):
                dependent.is_stale = True

        self.audit_repo.record(
            user.id, "artifact.update", "artifact", artifact.id, {"version": artifact.version}
        )
        try:
            self.artifact_repo.commit()
        except StaleDataError as exc:
            self.artifact_repo.rollback()
            raise ConflictError("Artifact was updated by another user; reload and retry") from exc
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

    # ── Human baseline comparisons ──────────────────────────────────────

    def create_baseline(self, project_id: str, payload: dict, user: User) -> dict:
        self.project_service.get_project_or_fail(project_id, user, write=True)
        if not payload.get("content"):
            raise ValidationError("Baseline content must not be empty")
        if len(json.dumps(payload["content"], ensure_ascii=False).encode("utf-8")) > 1_000_000:
            raise ValidationError("Baseline content must be 1 MB or smaller after extraction")
        baseline = EvaluationBaseline(
            id=self.artifact_repo.new_id(), project_id=project_id, uploaded_by=user.id,
            artifact_type=payload["artifact_type"], title=payload["title"].strip(),
            source_name=payload.get("source_name", ""), content=payload["content"],
        )
        self.artifact_repo.db.add(baseline)
        self.audit_repo.record(user.id, "evaluation.baseline.create", "evaluation_baseline",
                               baseline.id, {"artifact_type": baseline.artifact_type})
        self.artifact_repo.commit()
        return self._serialize_baseline(baseline)

    @staticmethod
    def _serialize_baseline(baseline: EvaluationBaseline) -> dict:
        return {"id": baseline.id, "project_id": baseline.project_id,
                "artifact_type": baseline.artifact_type, "title": baseline.title,
                "source_name": baseline.source_name, "content": baseline.content,
                "created_at": baseline.created_at}

    def list_baselines(self, project_id: str, user: User) -> list[dict]:
        self.project_service.get_project_or_fail(project_id, user)
        rows = self.artifact_repo.db.scalars(select(EvaluationBaseline).where(
            EvaluationBaseline.project_id == project_id
        ).order_by(EvaluationBaseline.created_at.desc())).all()
        return [self._serialize_baseline(row) for row in rows]

    @staticmethod
    def _comparison_metrics(generated: dict, baseline: dict) -> dict:
        generated_json = json.dumps(generated, sort_keys=True, ensure_ascii=False)
        baseline_json = json.dumps(baseline, sort_keys=True, ensure_ascii=False)
        tokenize = lambda text: set(re.findall(r"[\w]+", text.casefold()))
        generated_tokens = tokenize(generated_json)
        baseline_tokens = tokenize(baseline_json)
        overlap = len(generated_tokens & baseline_tokens)
        return {
            "accuracy": round(SequenceMatcher(None, generated_json, baseline_json).ratio(), 4),
            "completeness": round(overlap / len(baseline_tokens), 4) if baseline_tokens else 1.0,
            "relevance": round(overlap / len(generated_tokens), 4) if generated_tokens else 1.0,
            "method": "normalized_json_similarity_and_token_coverage",
        }

    def compare_to_baseline(self, baseline_id: str, artifact_id: str, user: User) -> dict:
        baseline = self.artifact_repo.db.get(EvaluationBaseline, baseline_id)
        if not baseline:
            raise ResourceNotFoundError("Evaluation baseline", baseline_id)
        artifact = self._get_artifact_or_fail(artifact_id)
        self.project_service.get_project_or_fail(artifact.project_id, user)
        if baseline.project_id != artifact.project_id or baseline.artifact_type != artifact.artifact_type:
            raise ValidationError("Baseline and generated artifact must share a project and artifact type")
        self.project_service.get_project_or_fail(baseline.project_id, user, write=True)
        metrics = self._comparison_metrics(artifact.content or {}, baseline.content or {})
        row = BaselineComparison(id=self.artifact_repo.new_id(), baseline_id=baseline.id,
                                 artifact_id=artifact.id, compared_by=user.id, metrics=metrics)
        self.artifact_repo.db.add(row)
        self.audit_repo.record(user.id, "evaluation.baseline.compare", "artifact", artifact.id,
                               {"baseline_id": baseline.id, "metrics": metrics})
        self.artifact_repo.commit()
        return {"id": row.id, "baseline_id": row.baseline_id, "artifact_id": row.artifact_id,
                "metrics": row.metrics, "created_at": row.created_at}

    def list_baseline_comparisons(self, baseline_id: str, user: User) -> list[dict]:
        baseline = self.artifact_repo.db.get(EvaluationBaseline, baseline_id)
        if not baseline:
            raise ResourceNotFoundError("Evaluation baseline", baseline_id)
        self.project_service.get_project_or_fail(baseline.project_id, user)
        rows = self.artifact_repo.db.scalars(select(BaselineComparison).where(
            BaselineComparison.baseline_id == baseline.id
        ).order_by(BaselineComparison.created_at.desc())).all()
        return [{"id": row.id, "artifact_id": row.artifact_id,
                 "compared_by": row.compared_by, "metrics": row.metrics,
                 "created_at": row.created_at} for row in rows]
