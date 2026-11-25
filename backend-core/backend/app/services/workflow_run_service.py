"""Service layer for durable orchestrated workflow runs."""
from __future__ import annotations

import uuid
import hashlib
import time
import os
import json
from datetime import datetime, timezone
from typing import Any

from app.domain.models import Artifact, PromptVersion, User, WorkflowRun
from app.ports.ai_engine_port import AIEnginePort
from app.repositories.workflow_run_repo import WorkflowRunRepository
from app.services.project_service import ProjectService


class WorkflowRunService:
    def __init__(
        self,
        run_repo: WorkflowRunRepository,
        project_service: ProjectService,
        ai_engine: AIEnginePort,
    ) -> None:
        self.run_repo = run_repo
        self.project_service = project_service
        self.ai_engine = ai_engine

    async def start_run(
        self,
        *,
        project_id: str,
        user: User,
        requirement_text: str,
        artifact_type: str = "user_story",
        requirement_id: str | None = None,
    ) -> dict[str, Any]:
        self.project_service.get_project_or_fail(project_id, user, write=True)
        run = self.run_repo.create_run(
            project_id=project_id,
            user_id=user.id,
            goal=requirement_text,
            artifact_type=artifact_type,
            requirement_id=requirement_id,
        )
        prompt_overrides, assignments = self._select_prompts(run.id)
        run.prompt_assignments = assignments
        self.run_repo.db.commit()
        self.run_repo.append_events(
            run.id,
            [
                {
                    "event_id": f"evt_{uuid.uuid4().hex[:12]}",
                    "node_id": "orchestrator",
                    "agent": "harness",
                    "status": "running",
                    "content": "Orchestrated run started",
                }
            ],
        )
        self.run_repo.update_run(run, status="running", started_at=datetime.now(timezone.utc))
        started_at_monotonic = time.monotonic()
        try:
            start_kwargs = dict(
                run_id=run.id,
                project_id=project_id,
                requirement_text=requirement_text,
                artifact_type=artifact_type,
            )
            if prompt_overrides:
                start_kwargs["prompt_overrides"] = prompt_overrides
            engine_result = await self.ai_engine.start_orchestrated_run(**start_kwargs)
        except Exception as exc:
            detail = getattr(exc, "detail", None)
            error = json.dumps(detail, ensure_ascii=False) if isinstance(detail, dict) else str(exc)
            self.run_repo.update_run(run, status="failed", error_message=error,
                                     completed_at=datetime.now(timezone.utc))
            if isinstance(detail, dict) and "error_class" in detail:
                self.run_repo.save_artifact(run_id=run.id, artifact_type="llm_failure",
                                            name=str(detail.get("agent") or "failed_node"), content=detail)
            self.run_repo.append_events(
                run.id,
                [
                    {
                        "event_id": f"evt_{uuid.uuid4().hex[:12]}",
                        "node_id": "orchestrator",
                        "agent": "harness",
                        "status": "failed",
                        "content": str(exc),
                    }
                ],
            )
            raise
        engine_result.setdefault("latency_ms", int((time.monotonic() - started_at_monotonic) * 1000))
        return self._persist_engine_result(run, engine_result)

    def _select_prompts(self, run_id: str) -> tuple[dict[str, str], dict[str, Any]]:
        rows = self.run_repo.db.query(PromptVersion).filter(PromptVersion.enabled.is_(True)).all()
        by_node: dict[str, list[PromptVersion]] = {}
        for row in rows:
            by_node.setdefault(row.node_id, []).append(row)
        prompts: dict[str, str] = {}
        assignments: dict[str, Any] = {}
        for node_id, variants in by_node.items():
            experiments: dict[str, list[PromptVersion]] = {}
            for row in variants:
                if row.experiment_id:
                    experiments.setdefault(row.experiment_id, []).append(row)
            if experiments:
                experiment_id = max(experiments, key=lambda key: max(r.created_at for r in experiments[key]))
                candidates = sorted(experiments[experiment_id], key=lambda row: row.version)
                if sum(row.weight for row in candidates) != 100:
                    continue
                bucket = int(hashlib.sha256(f"{run_id}:{experiment_id}".encode()).hexdigest()[:8], 16) % 100
                cumulative = 0
                chosen = candidates[-1]
                for row in candidates:
                    cumulative += row.weight
                    if bucket < cumulative:
                        chosen = row
                        break
            else:
                chosen = max(variants, key=lambda row: row.created_at)
            prompts[node_id] = chosen.template
            assignments[node_id] = {"prompt_id": chosen.id, "version": chosen.version,
                                    "prompt_hash": chosen.prompt_hash,
                                    "experiment_id": chosen.experiment_id}
        return prompts, assignments

    async def resume_run(
        self,
        *,
        run_id: str,
        user: User,
        resume_payload: dict[str, Any],
    ) -> dict[str, Any]:
        run = self.run_repo.get_run(run_id)
        if not run:
            raise KeyError("Workflow run not found")
        self.project_service.get_project_or_fail(run.project_id, user, write=True)
        if run.status != "waiting_review" or not run.checkpoint:
            raise ValueError(f"Run {run_id} is not waiting for review")

        self.run_repo.update_run(
            run,
            status="running",
            paused_node_id=run.paused_node_id,
            checkpoint=run.checkpoint,
        )
        started_at_monotonic = time.monotonic()
        try:
            engine_result = await self.ai_engine.resume_orchestrated_run(
                checkpoint=run.checkpoint,
                resume_payload=resume_payload,
            )
        except Exception as exc:
            detail = getattr(exc, "detail", None)
            error = json.dumps(detail, ensure_ascii=False) if isinstance(detail, dict) else str(exc)
            self.run_repo.update_run(run, status="failed", error_message=error,
                                     completed_at=datetime.now(timezone.utc))
            if isinstance(detail, dict) and "error_class" in detail:
                self.run_repo.save_artifact(run_id=run.id, artifact_type="llm_failure",
                                            name=str(detail.get("agent") or "failed_node"), content=detail)
            raise
        engine_result.setdefault("latency_ms", int((time.monotonic() - started_at_monotonic) * 1000))
        return self._persist_engine_result(run, engine_result)

    def get_run(self, run_id: str, user: User) -> dict[str, Any]:
        run = self.run_repo.get_run(run_id)
        if not run:
            raise KeyError("Workflow run not found")
        self.project_service.get_project_or_fail(run.project_id, user)
        return self._serialize_run(run)

    def reject_run(self, run_id: str, user: User) -> dict[str, Any]:
        run = self.run_repo.get_run(run_id)
        if not run:
            raise KeyError("Workflow run not found")
        self.project_service.get_project_or_fail(run.project_id, user, write=True)
        if run.status != "waiting_review":
            raise ValueError(f"Run {run_id} is not waiting for review")
        updated = self.run_repo.update_run(
            run, status="failed", current_node=run.paused_node_id,
            error_message="Run rejected during human review",
            completed_at=datetime.now(timezone.utc),
        )
        self.run_repo.append_events(run.id, [{
            "event_id": f"evt_{uuid.uuid4().hex[:12]}", "node_id": run.paused_node_id or "review",
            "agent": "human_reviewer", "status": "rejected", "content": "Run rejected during human review",
        }])
        return self._serialize_run(updated)

    def list_runs(self, project_id: str, user: User) -> list[dict[str, Any]]:
        self.project_service.get_project_or_fail(project_id, user)
        return [self._serialize_run(r) for r in self.run_repo.list_runs(project_id)]

    def metrics(self, project_id: str, user: User) -> dict[str, Any]:
        self.project_service.get_project_or_fail(project_id, user)
        runs = self.run_repo.list_runs(project_id, limit=1000)
        statuses: dict[str, int] = {}
        prompt_tokens = completion_tokens = latency_ms = 0
        for run in runs:
            statuses[run.status] = statuses.get(run.status, 0) + 1
            usage = run.usage or {}
            prompt_tokens += int(usage.get("prompt_tokens", 0) or 0)
            completion_tokens += int(usage.get("completion_tokens", 0) or 0)
            latency_ms += int(run.latency_ms or 0)
        input_rate = os.getenv("SPRINTSMITH_INPUT_COST_PER_1K_TOKENS")
        output_rate = os.getenv("SPRINTSMITH_OUTPUT_COST_PER_1K_TOKENS")
        estimated_cost = None
        if input_rate is not None and output_rate is not None:
            try:
                estimated_cost = (prompt_tokens * float(input_rate) + completion_tokens * float(output_rate)) / 1000
            except ValueError:
                estimated_cost = None
        return {"run_count": len(runs), "status_counts": statuses,
                "prompt_tokens": prompt_tokens, "completion_tokens": completion_tokens,
                "total_tokens": prompt_tokens + completion_tokens,
                "total_latency_ms": latency_ms,
                "average_latency_ms": round(latency_ms / len(runs)) if runs else 0,
                "estimated_cost_usd": round(estimated_cost, 6) if estimated_cost is not None else None}

    def get_events(self, run_id: str, user: User) -> list[dict[str, Any]]:
        run = self.run_repo.get_run(run_id)
        if not run:
            raise KeyError("Workflow run not found")
        self.project_service.get_project_or_fail(run.project_id, user)
        return [
            {
                "id": e.id,
                "run_id": e.run_id,
                "node_id": e.node_id,
                "agent": e.agent,
                "status": e.status,
                "content": e.content,
                "data": e.data,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in self.run_repo.list_events(run_id)
        ]

    def _persist_engine_result(self, run: WorkflowRun, res: dict[str, Any]) -> dict[str, Any]:
        events = res.get("events") or []
        if events:
            self.run_repo.append_events(run.id, events)
        for name, content in (res.get("outputs") or {}).items():
            if isinstance(content, dict):
                self.run_repo.save_artifact(run_id=run.id, artifact_type="node_output",
                                            name=str(name)[:120], content=content)

        status = str(res.get("status") or "completed")
        checkpoint = res.get("checkpoint")
        packet = res.get("human_review_packet")
        final_artifact = res.get("final_artifact") or None

        if checkpoint:
            self.run_repo.save_artifact(
                run_id=run.id,
                artifact_type="workflow_checkpoint",
                name=str(res.get("paused_node_id") or "checkpoint"),
                content=checkpoint,
            )
        if final_artifact:
            self.run_repo.save_artifact(
                run_id=run.id,
                artifact_type="final_artifact",
                name=str(run.artifact_type),
                content=final_artifact,
            )
            db = self.run_repo.db
            if not db.query(Artifact).filter(Artifact.generation_run_id == run.id).first():
                story = final_artifact.get("user_story")
                source_ids = [run.requirement_id] if run.requirement_id else []
                approval = "approved" if status == "completed" else "pending"
                story_id = str(uuid.uuid4())
                db.add(Artifact(
                    id=story_id, project_id=run.project_id, created_by=run.user_id,
                    artifact_type="user_story", title=str((story or {}).get("title") or "Generated user story"),
                    content=story or final_artifact, parent_artifact_ids=[],
                    source_requirement_ids=source_ids, generation_run_id=run.id,
                    approval_status=approval, is_stale=False,
                ))
                acs = final_artifact.get("acceptance_criteria") or []
                ac_id = None
                if acs:
                    ac_id = str(uuid.uuid4())
                    db.add(Artifact(
                        id=ac_id, project_id=run.project_id, created_by=run.user_id,
                        artifact_type="acceptance_criteria", title="Acceptance criteria",
                        content={"criteria": acs}, parent_artifact_ids=[story_id],
                        source_requirement_ids=source_ids, generation_run_id=run.id,
                        approval_status=approval, is_stale=False,
                    ))
                cases = final_artifact.get("test_cases") or []
                if cases:
                    db.add(Artifact(
                        id=str(uuid.uuid4()), project_id=run.project_id, created_by=run.user_id,
                        artifact_type="test_case", title="Test cases", content={"cases": cases},
                        parent_artifact_ids=[ac_id or story_id], source_requirement_ids=source_ids,
                        generation_run_id=run.id, approval_status=approval, is_stale=False,
                    ))

        updated = self.run_repo.update_run(
            run,
            status=status,
            current_node=res.get("paused_node_id") or ("completed" if status == "completed" else None),
            final_report=final_artifact if status == "completed" else None,
            started_at=run.started_at or datetime.now(timezone.utc),
            completed_at=datetime.now(timezone.utc) if status in {"completed", "failed"} else None,
            usage=res.get("usage") or {},
            latency_ms=int(run.latency_ms or 0) + int(res.get("latency_ms") or 0),
            paused_node_id=res.get("paused_node_id"),
            checkpoint=checkpoint,
            human_review_packet=packet,
            final_artifact=final_artifact,
        )
        return self._serialize_run(updated)

    def _serialize_run(self, run: WorkflowRun) -> dict[str, Any]:
        return {
            "id": run.id,
            "project_id": run.project_id,
            "user_id": run.user_id,
            "requirement_id": run.requirement_id,
            "artifact_type": run.artifact_type,
            "status": run.status,
            "current_node": run.current_node,
            "final_report": run.final_report,
            "started_at": run.started_at.isoformat() if run.started_at else None,
            "completed_at": run.completed_at.isoformat() if run.completed_at else None,
            "usage": run.usage or {},
            "latency_ms": run.latency_ms,
            "prompt_assignments": run.prompt_assignments or {},
            "paused_node_id": run.paused_node_id,
            "human_review_packet": run.human_review_packet,
            "final_artifact": run.final_artifact,
            "error_message": run.error_message,
            "created_at": run.created_at.isoformat() if run.created_at else None,
            "updated_at": run.updated_at.isoformat() if run.updated_at else None,
        }
