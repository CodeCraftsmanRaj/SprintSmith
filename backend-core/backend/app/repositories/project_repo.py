from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.domain.models import Project, ProjectInvitation, ProjectMember, User
from app.repositories.base import BaseRepository


class ProjectRepository(BaseRepository[Project]):
    def __init__(self, db: Session):
        super().__init__(db, Project)

    def list_for_user(self, user_id: str) -> list[Project]:
        """Return projects the user owns or is a member of, newest first."""
        stmt = (
            select(Project)
            .outerjoin(ProjectMember, ProjectMember.project_id == Project.id)
            .where(or_(Project.owner_id == user_id, ProjectMember.user_id == user_id))
            .order_by(Project.created_at.desc())
        )
        return list(self.db.scalars(stmt).unique())

    def list_all(self) -> list[Project]:
        return list(self.db.scalars(select(Project).order_by(Project.created_at.desc())))

    def get_membership(self, project_id: str, user_id: str) -> ProjectMember | None:
        return self.db.scalar(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == user_id,
            )
        )

    def add_member(self, member: ProjectMember) -> ProjectMember:
        self.db.add(member)
        return member

    def list_members(self, project_id: str) -> list[tuple[ProjectMember, User]]:
        stmt = (
            select(ProjectMember, User)
            .join(User, User.id == ProjectMember.user_id)
            .where(ProjectMember.project_id == project_id)
            .order_by(ProjectMember.created_at.asc(), User.email.asc())
        )
        return list(self.db.execute(stmt).all())

    def list_invitations(self, project_id: str) -> list[ProjectInvitation]:
        stmt = (
            select(ProjectInvitation)
            .where(ProjectInvitation.project_id == project_id)
            .order_by(ProjectInvitation.created_at.desc())
        )
        return list(self.db.scalars(stmt))

    def get_invitation_by_hash(self, token_hash: str) -> ProjectInvitation | None:
        return self.db.scalar(
            select(ProjectInvitation).where(ProjectInvitation.token_hash == token_hash)
        )

    def get_invitation_by_id(self, invitation_id: str) -> ProjectInvitation | None:
        return self.db.get(ProjectInvitation, invitation_id)

    def get_invitation_for_email(self, project_id: str, email: str) -> ProjectInvitation | None:
        return self.db.scalar(
            select(ProjectInvitation).where(
                ProjectInvitation.project_id == project_id,
                ProjectInvitation.email == email,
            )
        )
