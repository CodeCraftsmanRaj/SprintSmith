"""Add requirement review metadata and immutable version snapshots."""
import sqlalchemy as sa
from alembic import op

revision = "0008_requirement_lifecycle"
down_revision = "0007_prompt_governance_metrics"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("requirements"):
        cols = {c["name"] for c in inspector.get_columns("requirements")}
        with op.batch_alter_table("requirements") as batch:
            additions = (
                ("category", sa.String(100), None),
                ("tags", sa.JSON(), "[]"),
                ("priority", sa.String(20), "medium"),
                ("review_status", sa.String(20), "pending"),
                ("version", sa.Integer(), "1"),
                ("index_stale", sa.Boolean(), "0"),
                ("updated_at", sa.DateTime(timezone=True), sa.func.now()),
            )
            for name, typ, default in additions:
                if name not in cols:
                    batch.add_column(sa.Column(
                        name, typ, nullable=(default is None and name in {"category", "updated_at"}),
                        server_default=default,
                    ))
        inspector = sa.inspect(bind)
        indexes = {index["name"] for index in inspector.get_indexes("requirements")}
        for name, col in (("ix_requirements_category", "category"),
                          ("ix_requirements_priority", "priority"),
                          ("ix_requirements_review_status", "review_status")):
            if name not in indexes:
                op.create_index(name, "requirements", [col])

    if not inspector.has_table("requirement_versions"):
        op.create_table(
            "requirement_versions",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("requirement_id", sa.String(36),
                      sa.ForeignKey("requirements.id", ondelete="CASCADE"), nullable=False),
            sa.Column("version", sa.Integer(), nullable=False),
            sa.Column("changed_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("snapshot", sa.JSON(), nullable=False),
            sa.Column("change_summary", sa.String(500), nullable=False,
                      server_default="Requirement updated"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                      server_default=sa.func.now()),
        )
        op.create_index("ix_requirement_versions_requirement_id", "requirement_versions",
                        ["requirement_id"])


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("requirement_versions"):
        op.drop_index("ix_requirement_versions_requirement_id", table_name="requirement_versions")
        op.drop_table("requirement_versions")
    if inspector.has_table("requirements"):
        cols = {c["name"] for c in inspector.get_columns("requirements")}
        indexes = {index["name"] for index in inspector.get_indexes("requirements")}
        for name in ("ix_requirements_category", "ix_requirements_priority",
                     "ix_requirements_review_status"):
            if name in indexes:
                op.drop_index(name, table_name="requirements")
        with op.batch_alter_table("requirements") as batch:
            for name in ("category", "tags", "priority", "review_status", "version",
                         "index_stale", "updated_at"):
                if name in cols:
                    batch.drop_column(name)
