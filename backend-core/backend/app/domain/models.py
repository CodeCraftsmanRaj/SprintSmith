"""
SQLAlchemy ORM entity definitions.

All models inherit from `Base` (declared in core.database) so Alembic
auto-discovers them via a single `import app.domain.models` in env.py.
"""

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)

USERS_ID_FK = "users.id"
PROJECTS_ID_FK = "projects.id"
ARTIFACTS_ID_FK = "artifacts.id"

# ── Users ───────────────────────────────────────────────────────────────────


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(160))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="member")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    password_reset_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    password_reset_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now_utc)

    memberships = relationship("ProjectMember", back_populates="user", cascade="all, delete-orphan")


# ── Projects ────────────────────────────────────────────────────────────────


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    owner_id: Mapped[str] = mapped_column(ForeignKey(USERS_ID_FK), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now_utc)

    members = relationship("ProjectMember", back_populates="project", cascade="all, delete-orphan")


class ProjectMember(Base):
    __tablename__ = "project_members"
    __table_args__ = (UniqueConstraint("project_id", "user_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey(PROJECTS_ID_FK, ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey(USERS_ID_FK, ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(20), default="member")

    project = relationship("Project", back_populates="members")
    user = relationship("User", back_populates="memberships")


class ProjectInvitation(Base):
    __tablename__ = "project_invitations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey(PROJECTS_ID_FK, ondelete="CASCADE"), index=True)
    email: Mapped[str] = mapped_column(String(320), index=True)
    role: Mapped[str] = mapped_column(String(20))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    invited_by: Mapped[str] = mapped_column(ForeignKey(USERS_ID_FK))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now_utc)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


# ── Requirements ────────────────────────────────────────────────────────────


class Requirement(Base):
    __tablename__ = "requirements"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey(PROJECTS_ID_FK, ondelete="CASCADE"), index=True)
    uploaded_by: Mapped[str] = mapped_column(ForeignKey(USERS_ID_FK))
    filename: Mapped[str] = mapped_column(String(255))
    file_path: Mapped[str] = mapped_column(Text)
    content: Mapped[str] = mapped_column(Text, default="")
    doc_type: Mapped[str] = mapped_column(String(50), default="requirement")
    chunks_indexed: Mapped[int] = mapped_column(Integer, default=0)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    tags: Mapped[list] = mapped_column(JSON, default=list)
    priority: Mapped[str] = mapped_column(String(20), default="medium", index=True)
    review_status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    __mapper_args__ = {"version_id_col": version}
    index_stale: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now_utc, onupdate=_now_utc)


class RequirementVersion(Base):
    """Immutable snapshot of a requirement before an edit or review decision."""
    __tablename__ = "requirement_versions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    requirement_id: Mapped[str] = mapped_column(
        ForeignKey("requirements.id", ondelete="CASCADE"), index=True
    )
    version: Mapped[int] = mapped_column(Integer)
    changed_by: Mapped[str] = mapped_column(ForeignKey(USERS_ID_FK))
    snapshot: Mapped[dict] = mapped_column(JSON)
    change_summary: Mapped[str] = mapped_column(String(500), default="Requirement updated")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now_utc)


class DocTreeNode(Base):
    """Document tree index (IMPLEMENTATION.draft.md §2.3.3). One row per heading section.
    id is the node_id shared with vector child-chunk metadata."""
    __tablename__ = "doc_tree_nodes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey(PROJECTS_ID_FK, ondelete="CASCADE"), index=True)
    doc_id: Mapped[str] = mapped_column(ForeignKey("requirements.id", ondelete="CASCADE"), index=True)
    parent_id: Mapped[str | None] = mapped_column(
        ForeignKey("doc_tree_nodes.id", ondelete="CASCADE"), nullable=True, index=True)
    ordinal: Mapped[str] = mapped_column(String(64))
    level: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(512))
    page_start: Mapped[int | None] = mapped_column(Integer, nullable=True)
    page_end: Mapped[int | None] = mapped_column(Integer, nullable=True)
    text: Mapped[str] = mapped_column(Text, default="")
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    low_structure: Mapped[bool] = mapped_column(Boolean, default=False)
    content_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now_utc)


# ── Artifacts ───────────────────────────────────────────────────────────────


class Artifact(Base):
    __tablename__ = "artifacts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey(PROJECTS_ID_FK, ondelete="CASCADE"), index=True)
    created_by: Mapped[str] = mapped_column(ForeignKey(USERS_ID_FK))
    artifact_type: Mapped[str] = mapped_column(String(80), index=True)
    title: Mapped[str] = mapped_column(String(255), default="Generated artifact")
    content: Mapped[dict] = mapped_column(JSON)
    parent_artifact_ids: Mapped[list] = mapped_column(JSON, default=list)
    source_requirement_ids: Mapped[list] = mapped_column(JSON, default=list)
    generation_run_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    approval_status: Mapped[str] = mapped_column(String(32), default="approved")
    status: Mapped[str] = mapped_column(String(32), default="backlog", index=True)
    priority: Mapped[str] = mapped_column(String(20), default="medium", index=True)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    assigned_to: Mapped[str | None] = mapped_column(ForeignKey(USERS_ID_FK, ondelete="SET NULL"), nullable=True, index=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, index=True)
    is_stale: Mapped[bool] = mapped_column(Boolean, default=False)
    version: Mapped[int] = mapped_column(Integer, default=1)
    __mapper_args__ = {"version_id_col": version}
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now_utc, onupdate=_now_utc)


class ArtifactStatusHistory(Base):
    __tablename__ = "artifact_status_history"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    artifact_id: Mapped[str] = mapped_column(ForeignKey(ARTIFACTS_ID_FK, ondelete="CASCADE"), index=True)
    changed_by: Mapped[str] = mapped_column(ForeignKey(USERS_ID_FK))
    previous_status: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now_utc, index=True)


class GenerationHistory(Base):
    __tablename__ = "generation_history"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey(PROJECTS_ID_FK, ondelete="CASCADE"), index=True)
    artifact_id: Mapped[str] = mapped_column(ForeignKey(ARTIFACTS_ID_FK, ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey(USERS_ID_FK))
    requirement_id: Mapped[str | None] = mapped_column(
        ForeignKey("requirements.id", ondelete="SET NULL"), nullable=True, index=True)
    engine_request_id: Mapped[str] = mapped_column(String(100))
    artifact_type: Mapped[str] = mapped_column(String(80))
    prompt_version: Mapped[str] = mapped_column(String(100))
    usage: Mapped[dict] = mapped_column(JSON, default=dict)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    requirement_text: Mapped[str] = mapped_column(Text)
    # SOP swarm telemetry (IMPLEMENTATION.draft.md §6.1)
    eval_score: Mapped[float | None] = mapped_column(nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    model_used: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now_utc)


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey(PROJECTS_ID_FK, ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey(USERS_ID_FK, ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(10))
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now_utc, index=True)


# ── Ingestion jobs ────────────────────────────────────────────────────────────


class IngestJob(Base):
    """Tracks the async ai-engine ingestion job per requirement (§2.2.4, §6.2).
    engine_job_id is the ai-engine job handle used for polling (addition over the plan)."""
    __tablename__ = "ingest_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    requirement_id: Mapped[str] = mapped_column(ForeignKey("requirements.id", ondelete="CASCADE"), index=True)
    engine_job_id: Mapped[str] = mapped_column(String(64), default="")
    status: Mapped[str] = mapped_column(String(20), default="processing")
    chunks_indexed: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now_utc, onupdate=_now_utc)


# ── Evaluations ─────────────────────────────────────────────────────────────


class Evaluation(Base):
    __tablename__ = "evaluations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    artifact_id: Mapped[str] = mapped_column(ForeignKey(ARTIFACTS_ID_FK, ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey(USERS_ID_FK))
    score: Mapped[int] = mapped_column(Integer)
    feedback: Mapped[str] = mapped_column(Text, default="")
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now_utc)


class EvaluationBaseline(Base):
    __tablename__ = "evaluation_baselines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey(PROJECTS_ID_FK, ondelete="CASCADE"), index=True)
    uploaded_by: Mapped[str] = mapped_column(ForeignKey(USERS_ID_FK))
    artifact_type: Mapped[str] = mapped_column(String(80), index=True)
    title: Mapped[str] = mapped_column(String(255))
    source_name: Mapped[str] = mapped_column(String(255), default="")
    content: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now_utc, index=True)


class BaselineComparison(Base):
    __tablename__ = "baseline_comparisons"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    baseline_id: Mapped[str] = mapped_column(ForeignKey("evaluation_baselines.id", ondelete="CASCADE"), index=True)
    artifact_id: Mapped[str] = mapped_column(ForeignKey(ARTIFACTS_ID_FK, ondelete="CASCADE"), index=True)
    compared_by: Mapped[str] = mapped_column(ForeignKey(USERS_ID_FK))
    metrics: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now_utc, index=True)


# ── Audit ───────────────────────────────────────────────────────────────────


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey(USERS_ID_FK), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(100), index=True)
    resource_type: Mapped[str] = mapped_column(String(80))
    resource_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now_utc)


# ── Orchestrated Workflow Runs (DevAgent-Studio pattern) ──────────────────────


class WorkflowRun(Base):
    __tablename__ = "workflow_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey(PROJECTS_ID_FK, ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey(USERS_ID_FK))
    requirement_id: Mapped[str | None] = mapped_column(
        ForeignKey("requirements.id", ondelete="SET NULL"), nullable=True, index=True
    )
    artifact_type: Mapped[str] = mapped_column(String(80), default="user_story")
    goal: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default="created", index=True)
    current_node: Mapped[str | None] = mapped_column(String(80), nullable=True)
    final_report: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    prompt_assignments: Mapped[dict] = mapped_column(JSON, default=dict)
    usage: Mapped[dict] = mapped_column(JSON, default=dict)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    paused_node_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    checkpoint: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    human_review_packet: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    final_artifact: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now_utc)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now_utc, onupdate=_now_utc)


class RunEvent(Base):
    __tablename__ = "run_events"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("workflow_runs.id", ondelete="CASCADE"), index=True)
    node_id: Mapped[str] = mapped_column(String(80))
    agent: Mapped[str] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(32))
    content: Mapped[str] = mapped_column(Text, default="")
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now_utc, index=True)


class RunArtifact(Base):
    __tablename__ = "run_artifacts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("workflow_runs.id", ondelete="CASCADE"), index=True)
    artifact_type: Mapped[str] = mapped_column(String(80))
    name: Mapped[str] = mapped_column(String(120))
    content: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now_utc)


class PromptVersion(Base):
    """Versioned orchestrated prompt template with weighted experiment assignment."""
    __tablename__ = "prompt_versions"
    __table_args__ = (UniqueConstraint("node_id", "version"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    node_id: Mapped[str] = mapped_column(String(80), index=True)
    version: Mapped[str] = mapped_column(String(80))
    template: Mapped[str] = mapped_column(Text)
    prompt_hash: Mapped[str] = mapped_column(String(64))
    experiment_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    weight: Mapped[int] = mapped_column(Integer, default=100)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[str] = mapped_column(ForeignKey(USERS_ID_FK))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now_utc)
