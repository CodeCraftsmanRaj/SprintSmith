"""Add persistent artifact workflow fields and status history."""
import sqlalchemy as sa
from alembic import op

revision = "0011_artifact_workflow"
down_revision = "0010_account_controls"
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("artifacts"):
        return
    cols = {column["name"] for column in inspector.get_columns("artifacts")}
    indexes = {index["name"] for index in inspector.get_indexes("artifacts")}
    foreign_keys = inspector.get_foreign_keys("artifacts")
    has_assignee_fk = any(
        fk.get("constrained_columns") == ["assigned_to"]
        and fk.get("referred_table") == "users"
        for fk in foreign_keys
    )
    with op.batch_alter_table("artifacts") as batch:
        additions = (
            ("status", sa.String(32), "backlog"),
            ("priority", sa.String(20), "medium"),
            ("category", sa.String(100), None),
            ("assigned_to", sa.String(36), None),
            ("sort_order", sa.Integer(), "0"),
        )
        for name, typ, default in additions:
            if name not in cols:
                batch.add_column(sa.Column(name, typ, nullable=default is None,
                                           server_default=default))
        for name, columns in (
            ("ix_artifacts_status", ["status"]),
            ("ix_artifacts_priority", ["priority"]),
            ("ix_artifacts_category", ["category"]),
            ("ix_artifacts_assigned_to", ["assigned_to"]),
            ("ix_artifacts_sort_order", ["sort_order"]),
        ):
            if name not in indexes:
                batch.create_index(name, columns, unique=False)
        if not has_assignee_fk:
            batch.create_foreign_key(
                "fk_artifacts_assigned_to_users", "users", ["assigned_to"], ["id"],
                ondelete="SET NULL",
            )

    if not inspector.has_table("artifact_status_history"):
        op.create_table(
            "artifact_status_history",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("artifact_id", sa.String(36), sa.ForeignKey("artifacts.id", ondelete="CASCADE"), nullable=False),
            sa.Column("changed_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("previous_status", sa.String(32), nullable=False),
            sa.Column("status", sa.String(32), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index("ix_artifact_status_history_artifact_id", "artifact_status_history", ["artifact_id"])
        op.create_index("ix_artifact_status_history_created_at", "artifact_status_history", ["created_at"])


def downgrade():
    inspector = sa.inspect(op.get_bind())
    if inspector.has_table("artifact_status_history"):
        op.drop_index("ix_artifact_status_history_created_at", table_name="artifact_status_history")
        op.drop_index("ix_artifact_status_history_artifact_id", table_name="artifact_status_history")
        op.drop_table("artifact_status_history")
    if not inspector.has_table("artifacts"):
        return
    cols = {column["name"] for column in inspector.get_columns("artifacts")}
    with op.batch_alter_table("artifacts") as batch:
        for index in ("ix_artifacts_status", "ix_artifacts_priority", "ix_artifacts_category",
                      "ix_artifacts_assigned_to", "ix_artifacts_sort_order"):
            try:
                batch.drop_index(index)
            except Exception:
                pass
        if "assigned_to" in cols:
            try:
                batch.drop_constraint("fk_artifacts_assigned_to_users", type_="foreignkey")
            except Exception:
                pass
        for name in ("status", "priority", "category", "assigned_to", "sort_order"):
            if name in cols:
                batch.drop_column(name)
