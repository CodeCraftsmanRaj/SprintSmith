"""Add project invitation links and membership timestamps."""
import sqlalchemy as sa
from alembic import op

revision = "0005_project_collaboration"
down_revision = "0004_chat_msgs"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("project_members"):
        columns = {column["name"] for column in inspector.get_columns("project_members")}
        if "created_at" not in columns:
            op.add_column(
                "project_members",
                sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            )
        if "role" in columns:
            op.execute("UPDATE project_members SET role = 'viewer' WHERE role = 'member'")

    if not inspector.has_table("project_invitations"):
        op.create_table(
            "project_invitations",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
            sa.Column("email", sa.String(320), nullable=False),
            sa.Column("role", sa.String(20), nullable=False),
            sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
            sa.Column("invited_by", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
            sa.UniqueConstraint("project_id", "email", name="uq_project_invitation_email"),
        )

    inspector = sa.inspect(bind)
    indexes = {index["name"] for index in inspector.get_indexes("project_invitations")}
    for name, column in (
        ("ix_project_invitations_project_id", "project_id"),
        ("ix_project_invitations_email", "email"),
        ("ix_project_invitations_invited_by", "invited_by"),
        ("ix_project_invitations_status", "status"),
    ):
        if name not in indexes:
            op.create_index(name, "project_invitations", [column])


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("project_invitations"):
        op.drop_table("project_invitations")
    if inspector.has_table("project_members"):
        columns = {column["name"] for column in sa.inspect(bind).get_columns("project_members")}
        if "created_at" in columns:
            with op.batch_alter_table("project_members") as batch:
                batch.drop_column("created_at")
