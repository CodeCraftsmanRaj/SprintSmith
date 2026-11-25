"""Add failed-login lockout and one-time password reset state."""
import sqlalchemy as sa
from alembic import op

revision = "0010_account_controls"
down_revision = "0009_project_invitations"
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("users"):
        return
    cols = {column["name"] for column in inspector.get_columns("users")}
    with op.batch_alter_table("users") as batch:
        additions = (
            ("failed_login_attempts", sa.Integer(), "0"),
            ("locked_until", sa.DateTime(timezone=True), None),
            ("password_reset_token_hash", sa.String(64), None),
            ("password_reset_expires_at", sa.DateTime(timezone=True), None),
        )
        for name, typ, default in additions:
            if name not in cols:
                batch.add_column(sa.Column(name, typ, nullable=default is None,
                                           server_default=default))


def downgrade():
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table("users"):
        return
    cols = {column["name"] for column in inspector.get_columns("users")}
    with op.batch_alter_table("users") as batch:
        for name in ("failed_login_attempts", "locked_until", "password_reset_token_hash",
                     "password_reset_expires_at"):
            if name in cols:
                batch.drop_column(name)
