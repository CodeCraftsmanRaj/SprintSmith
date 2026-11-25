"""Add uploaded human baselines and comparison history."""
import sqlalchemy as sa
from alembic import op

revision = "0012_evaluation_baselines"
down_revision = "0011_artifact_workflow"
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("evaluation_baselines"):
        op.create_table(
            "evaluation_baselines",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
            sa.Column("uploaded_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("artifact_type", sa.String(80), nullable=False),
            sa.Column("title", sa.String(255), nullable=False),
            sa.Column("source_name", sa.String(255), nullable=False, server_default=""),
            sa.Column("content", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_evaluation_baselines_project_id", "evaluation_baselines", ["project_id"])
        op.create_index("ix_evaluation_baselines_artifact_type", "evaluation_baselines", ["artifact_type"])
        op.create_index("ix_evaluation_baselines_created_at", "evaluation_baselines", ["created_at"])
    if not inspector.has_table("baseline_comparisons"):
        op.create_table(
            "baseline_comparisons",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("baseline_id", sa.String(36), sa.ForeignKey("evaluation_baselines.id", ondelete="CASCADE"), nullable=False),
            sa.Column("artifact_id", sa.String(36), sa.ForeignKey("artifacts.id", ondelete="CASCADE"), nullable=False),
            sa.Column("compared_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("metrics", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_baseline_comparisons_baseline_id", "baseline_comparisons", ["baseline_id"])
        op.create_index("ix_baseline_comparisons_artifact_id", "baseline_comparisons", ["artifact_id"])
        op.create_index("ix_baseline_comparisons_created_at", "baseline_comparisons", ["created_at"])


def downgrade():
    inspector = sa.inspect(op.get_bind())
    if inspector.has_table("baseline_comparisons"):
        for name in ("ix_baseline_comparisons_created_at", "ix_baseline_comparisons_artifact_id",
                     "ix_baseline_comparisons_baseline_id"):
            op.drop_index(name, table_name="baseline_comparisons")
        op.drop_table("baseline_comparisons")
    if inspector.has_table("evaluation_baselines"):
        for name in ("ix_evaluation_baselines_created_at", "ix_evaluation_baselines_artifact_type",
                     "ix_evaluation_baselines_project_id"):
            op.drop_index(name, table_name="evaluation_baselines")
        op.drop_table("evaluation_baselines")
