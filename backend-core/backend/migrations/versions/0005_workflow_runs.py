"""Persist orchestrated workflow runs, granular events, and run artifacts."""
import sqlalchemy as sa
from alembic import op

revision = "0005_workflow_runs"
down_revision = "0004_chat_msgs"
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("workflow_runs"):
        op.create_table(
            "workflow_runs",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("requirement_id", sa.String(36), sa.ForeignKey("requirements.id", ondelete="SET NULL"), nullable=True),
            sa.Column("artifact_type", sa.String(80), nullable=False, server_default="user_story"),
            sa.Column("goal", sa.Text(), nullable=False),
            sa.Column("status", sa.String(32), nullable=False, server_default="created"),
            sa.Column("paused_node_id", sa.String(80), nullable=True),
            sa.Column("checkpoint", sa.JSON(), nullable=True),
            sa.Column("human_review_packet", sa.JSON(), nullable=True),
            sa.Column("final_artifact", sa.JSON(), nullable=True),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_workflow_runs_project_id", "workflow_runs", ["project_id"])
        op.create_index("ix_workflow_runs_status", "workflow_runs", ["status"])
        op.create_index("ix_workflow_runs_requirement_id", "workflow_runs", ["requirement_id"])

    if not inspector.has_table("run_events"):
        op.create_table(
            "run_events",
            sa.Column("id", sa.String(64), primary_key=True),
            sa.Column("run_id", sa.String(36), sa.ForeignKey("workflow_runs.id", ondelete="CASCADE"), nullable=False),
            sa.Column("node_id", sa.String(80), nullable=False),
            sa.Column("agent", sa.String(80), nullable=False),
            sa.Column("status", sa.String(32), nullable=False),
            sa.Column("content", sa.Text(), nullable=False, server_default=""),
            sa.Column("data", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_run_events_run_id", "run_events", ["run_id"])
        op.create_index("ix_run_events_created_at", "run_events", ["created_at"])

    if not inspector.has_table("run_artifacts"):
        op.create_table(
            "run_artifacts",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("run_id", sa.String(36), sa.ForeignKey("workflow_runs.id", ondelete="CASCADE"), nullable=False),
            sa.Column("artifact_type", sa.String(80), nullable=False),
            sa.Column("name", sa.String(120), nullable=False),
            sa.Column("content", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_run_artifacts_run_id", "run_artifacts", ["run_id"])


def downgrade():
    inspector = sa.inspect(op.get_bind())
    for table in ("run_artifacts", "run_events", "workflow_runs"):
        if inspector.has_table(table):
            op.drop_table(table)
