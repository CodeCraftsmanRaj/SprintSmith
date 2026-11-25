"""Add project invitation lifecycle."""
import sqlalchemy as sa
from alembic import op

revision = "0009_project_invitations"
down_revision = "0008_requirement_lifecycle"
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    if inspector.has_table("project_invitations"):
        return
    op.create_table(
        "project_invitations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36),
                  sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("invited_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_project_invitations_project_id", "project_invitations", ["project_id"])
    op.create_index("ix_project_invitations_email", "project_invitations", ["email"])
    op.create_index("ix_project_invitations_token_hash", "project_invitations", ["token_hash"])
    op.create_index("ix_project_invitations_status", "project_invitations", ["status"])


def downgrade():
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("project_invitations"):
        return
    for name in ("ix_project_invitations_status", "ix_project_invitations_token_hash",
                 "ix_project_invitations_email", "ix_project_invitations_project_id"):
        op.drop_index(name, table_name="project_invitations")
    op.drop_table("project_invitations")
