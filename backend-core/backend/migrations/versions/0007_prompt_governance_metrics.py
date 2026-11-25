"""Add DB prompt governance, experiment assignment, and run cost telemetry."""
import sqlalchemy as sa
from alembic import op

revision = "0007_prompt_governance_metrics"
down_revision = "0006_run_review_artifact_links"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    run_cols = {c["name"] for c in inspector.get_columns("workflow_runs")}
    with op.batch_alter_table("workflow_runs") as batch:
        for name, typ, default in (("prompt_assignments", sa.JSON(), "{}"),
                                   ("usage", sa.JSON(), "{}"),
                                   ("latency_ms", sa.Integer(), "0")):
            if name not in run_cols:
                batch.add_column(sa.Column(name, typ, nullable=False, server_default=default))
    if not inspector.has_table("prompt_versions"):
        op.create_table(
            "prompt_versions",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("node_id", sa.String(80), nullable=False),
            sa.Column("version", sa.String(80), nullable=False),
            sa.Column("template", sa.Text(), nullable=False),
            sa.Column("prompt_hash", sa.String(64), nullable=False),
            sa.Column("experiment_id", sa.String(80), nullable=True),
            sa.Column("weight", sa.Integer(), nullable=False, server_default="100"),
            sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("node_id", "version", name="uq_prompt_versions_node_version"),
        )
        op.create_index("ix_prompt_versions_node_id", "prompt_versions", ["node_id"])
        op.create_index("ix_prompt_versions_experiment_id", "prompt_versions", ["experiment_id"])


def downgrade():
    inspector = sa.inspect(op.get_bind())
    if inspector.has_table("prompt_versions"):
        op.drop_index("ix_prompt_versions_experiment_id", table_name="prompt_versions")
        op.drop_index("ix_prompt_versions_node_id", table_name="prompt_versions")
        op.drop_table("prompt_versions")
    if inspector.has_table("workflow_runs"):
        cols = {c["name"] for c in inspector.get_columns("workflow_runs")}
        with op.batch_alter_table("workflow_runs") as batch:
            for name in ("prompt_assignments", "usage", "latency_ms"):
                if name in cols:
                    batch.drop_column(name)
