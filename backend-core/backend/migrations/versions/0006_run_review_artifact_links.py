"""Add run lifecycle metadata and artifact dependency tracking."""
import sqlalchemy as sa
from alembic import op

revision = "0006_run_review_artifact_links"
down_revision = "0005_workflow_runs"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    run_cols = {c["name"] for c in inspector.get_columns("workflow_runs")}
    with op.batch_alter_table("workflow_runs") as batch:
        for name, typ in (("current_node", sa.String(80)), ("final_report", sa.JSON()),
                          ("started_at", sa.DateTime(timezone=True)),
                          ("completed_at", sa.DateTime(timezone=True))):
            if name not in run_cols:
                batch.add_column(sa.Column(name, typ, nullable=True))
    artifact_cols = {c["name"] for c in inspector.get_columns("artifacts")}
    with op.batch_alter_table("artifacts") as batch:
        additions = (("parent_artifact_ids", sa.JSON(), "[]"),
                     ("source_requirement_ids", sa.JSON(), "[]"),
                     ("generation_run_id", sa.String(36), None),
                     ("approval_status", sa.String(32), "approved"),
                     ("is_stale", sa.Boolean(), "0"))
        for name, typ, default in additions:
            if name not in artifact_cols:
                batch.add_column(sa.Column(name, typ, nullable=(default is None),
                                           server_default=default))
    if "generation_run_id" not in artifact_cols:
        op.create_index("ix_artifacts_generation_run_id", "artifacts", ["generation_run_id"])


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("artifacts"):
        cols = {c["name"] for c in inspector.get_columns("artifacts")}
        if "generation_run_id" in cols:
            op.drop_index("ix_artifacts_generation_run_id", table_name="artifacts")
        with op.batch_alter_table("artifacts") as batch:
            for name in ("parent_artifact_ids", "source_requirement_ids", "generation_run_id",
                         "approval_status", "is_stale"):
                if name in cols:
                    batch.drop_column(name)
    if inspector.has_table("workflow_runs"):
        cols = {c["name"] for c in inspector.get_columns("workflow_runs")}
        with op.batch_alter_table("workflow_runs") as batch:
            for name in ("current_node", "final_report", "started_at", "completed_at"):
                if name in cols:
                    batch.drop_column(name)
