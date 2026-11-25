"""Add project-scoped Kanban tasks."""
import sqlalchemy as sa
from alembic import op

revision = "0006_project_tasks"
down_revision = "0005_project_collaboration"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("tasks"):
        op.create_table(
            "tasks",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
            sa.Column("title", sa.String(200), nullable=False),
            sa.Column("description", sa.Text(), nullable=False, server_default=""),
            sa.Column("status", sa.String(20), nullable=False, server_default="todo"),
            sa.Column("priority", sa.String(10), nullable=False, server_default="medium"),
            sa.Column("assignee_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("due_date", sa.Date(), nullable=True),
            sa.Column("story_points", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
    inspector = sa.inspect(bind)
    indexes = {item["name"] for item in inspector.get_indexes("tasks")}
    for name, column in (
        ("ix_tasks_project_id", "project_id"),
        ("ix_tasks_status", "status"),
        ("ix_tasks_assignee_id", "assignee_id"),
    ):
        if name not in indexes:
            op.create_index(name, "tasks", [column])


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("tasks"):
        for index in sa.inspect(bind).get_indexes("tasks"):
            op.drop_index(index["name"], table_name="tasks")
        op.drop_table("tasks")
