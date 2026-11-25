"""
Project lifecycle business logic.

Owns project CRUD, membership management, and access-control checks.
Raises domain exceptions – never touches FastAPI directly.
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.core.exceptions import AuthorisationError, ConflictError, ResourceNotFoundError, ValidationError
from app.domain.models import Project, ProjectInvitation, ProjectMember, User
from app.repositories.audit_repo import AuditRepository
from app.repositories.project_repo import ProjectRepository
from app.repositories.user_repo import UserRepository


class ProjectService:
    def __init__(
        self,
        project_repo: ProjectRepository,
        user_repo: UserRepository,
        audit_repo: AuditRepository,
    ):
        self.project_repo = project_repo
        self.user_repo = user_repo
        self.audit_repo = audit_repo

    # ── Access helpers ──────────────────────────────────────────────────

    def get_project_or_fail(
        self, project_id: str, user: User, *, write: bool = False
    ) -> Project:
        """
        Retrieve a project the *user* has access to.

        Raises ResourceNotFoundError (404) or AuthorisationError (403).
        """
        project = self.project_repo.get(project_id)
        if not project:
            raise ResourceNotFoundError("Project", project_id)

        # Owner and admin always pass
        if project.owner_id == user.id or user.role == "admin":
            return project

        member = self.project_repo.get_membership(project_id, user.id)
        if not member or (write and member.role not in ("owner", "admin", "editor")):
            raise AuthorisationError("You do not have access to this project")

        return project

    def _assert_owner_or_admin(self, project: Project, user: User) -> None:
        if user.role != "admin" and project.owner_id != user.id:
            raise AuthorisationError("Only the project owner can perform this action")

    def _assert_project_manager(self, project: Project, user: User) -> None:
        if user.role == "admin" or project.owner_id == user.id:
            return
        membership = self.project_repo.get_membership(project.id, user.id)
        if not membership or membership.role != "admin":
            raise AuthorisationError("Project owner or project admin permission is required")

    # ── CRUD ────────────────────────────────────────────────────────────

    def create(self, name: str, description: str, user: User) -> Project:
        project = Project(
            id=self.project_repo.new_id(),
            name=name.strip(),
            description=description,
            owner_id=user.id,
        )
        self.project_repo.add(project)
        self.project_repo.flush()

        self.project_repo.add_member(
            ProjectMember(
                id=self.project_repo.new_id(),
                project_id=project.id,
                user_id=user.id,
                role="owner",
            )
        )
        self.audit_repo.record(user.id, "project.create", "project", project.id)
        self.project_repo.commit()
        return self.project_repo.refresh(project)

    def list_for_user(self, user: User) -> list[Project]:
        return self.project_repo.list_for_user(user.id)

    def update(
        self, project_id: str, user: User, updates: dict
    ) -> Project:
        project = self.get_project_or_fail(project_id, user, write=True)
        self._assert_owner_or_admin(project, user)

        for key, value in updates.items():
            setattr(project, key, value)

        self.audit_repo.record(user.id, "project.update", "project", project.id)
        self.project_repo.commit()
        return self.project_repo.refresh(project)

    def delete(self, project_id: str, user: User) -> None:
        project = self.get_project_or_fail(project_id, user, write=True)
        self._assert_owner_or_admin(project, user)

        self.audit_repo.record(user.id, "project.delete", "project", project.id)
        self.project_repo.delete(project)
        self.project_repo.commit()

    # ── Membership ──────────────────────────────────────────────────────

    def set_member(
        self, project_id: str, email: str, role: str, user: User
    ) -> dict:
        project = self.get_project_or_fail(project_id, user, write=True)
        self._assert_project_manager(project, user)

        if role not in {"admin", "editor", "viewer"}:
            raise ValidationError("Role must be admin, editor, or viewer")

        member_user = self.user_repo.get_by_email(email.lower())
        if not member_user:
            raise ResourceNotFoundError("User")
        if member_user.id == project.owner_id:
            raise ValidationError("The project owner's role cannot be changed")

        existing = self.project_repo.get_membership(project_id, member_user.id)
        if existing:
            existing.role = role
            membership = existing
        else:
            membership = ProjectMember(
                id=self.project_repo.new_id(),
                project_id=project_id,
                user_id=member_user.id,
                role=role,
            )
            self.project_repo.add_member(membership)

        self.audit_repo.record(
            user.id,
            "project.member.set",
            "project",
            project_id,
            {"member_id": member_user.id, "role": role},
        )
        self.project_repo.commit()
        return {
            "project_id": project_id,
            "user_id": member_user.id,
            "role": membership.role,
        }

    def list_members(self, project_id: str, user: User) -> list[dict]:
        self.get_project_or_fail(project_id, user)
        rows = self.project_repo.db.execute(
            select(ProjectMember, User)
            .join(User, User.id == ProjectMember.user_id)
            .where(ProjectMember.project_id == project_id)
            .order_by(ProjectMember.role, User.email)
        ).all()
        return [{"project_id": project_id, "user_id": member.user_id,
                 "email": member_user.email, "full_name": member_user.full_name,
                 "role": member.role} for member, member_user in rows]

    def update_member_role(self, project_id: str, member_user_id: str,
                           role: str, user: User) -> dict:
        project = self.get_project_or_fail(project_id, user, write=True)
        self._assert_project_manager(project, user)
        if role not in {"admin", "editor", "viewer"}:
            raise ValidationError("Role must be admin, editor, or viewer")
        if member_user_id == project.owner_id:
            raise ValidationError("The project owner's role cannot be changed")
        membership = self.project_repo.get_membership(project_id, member_user_id)
        if not membership:
            raise ResourceNotFoundError("Project member", member_user_id)
        old_role = membership.role
        if old_role != role:
            membership.role = role
            self.audit_repo.record(user.id, "project.member.role_update", "project", project_id,
                                   {"member_id": member_user_id, "from": old_role, "to": role})
            self.project_repo.commit()
        return {"project_id": project_id, "user_id": member_user_id, "role": membership.role}

    def remove_member(self, project_id: str, member_user_id: str, user: User) -> None:
        project = self.get_project_or_fail(project_id, user, write=True)
        self._assert_project_manager(project, user)
        if member_user_id == project.owner_id:
            raise ValidationError("The project owner cannot be removed")
        membership = self.project_repo.get_membership(project_id, member_user_id)
        if not membership:
            raise ResourceNotFoundError("Project member", member_user_id)
        role = membership.role
        self.project_repo.db.delete(membership)
        self.audit_repo.record(user.id, "project.member.remove", "project", project_id,
                               {"member_id": member_user_id, "role": role})
        self.project_repo.commit()

    def create_invitation(self, project_id: str, email: str, role: str, user: User) -> dict:
        project = self.get_project_or_fail(project_id, user, write=True)
        self._assert_project_manager(project, user)
        if role not in {"admin", "editor", "viewer"}:
            raise ValidationError("Role must be admin, editor, or viewer")
        normalized_email = email.strip().lower()
        member_user = self.user_repo.get_by_email(normalized_email)
        if member_user and self.project_repo.get_membership(project_id, member_user.id):
            raise ConflictError("User is already a project member")

        db = self.project_repo.db
        old_pending = db.scalars(select(ProjectInvitation).where(
            ProjectInvitation.project_id == project_id,
            ProjectInvitation.email == normalized_email,
            ProjectInvitation.status == "pending",
        )).all()
        now = datetime.now(timezone.utc)
        for old in old_pending:
            old.status = "revoked"
            old.responded_at = now

        raw_token = secrets.token_urlsafe(32)
        invitation = ProjectInvitation(
            id=self.project_repo.new_id(), project_id=project_id,
            email=normalized_email, role=role,
            token_hash=hashlib.sha256(raw_token.encode()).hexdigest(),
            status="pending", invited_by=user.id,
            expires_at=now + timedelta(days=7),
        )
        db.add(invitation)
        self.audit_repo.record(user.id, "project.invitation.create", "project", project_id,
                               {"invitation_id": invitation.id, "email": normalized_email,
                                "role": role})
        db.commit()
        db.refresh(invitation)
        return {"id": invitation.id, "project_id": project_id, "email": normalized_email,
                "role": role, "status": invitation.status, "invited_by": user.id,
                "expires_at": invitation.expires_at, "created_at": invitation.created_at,
                "invitation_token": raw_token}

    def list_invitations(self, project_id: str, user: User) -> list[dict]:
        project = self.get_project_or_fail(project_id, user)
        self._assert_project_manager(project, user)
        rows = self.project_repo.db.scalars(select(ProjectInvitation).where(
            ProjectInvitation.project_id == project_id
        ).order_by(ProjectInvitation.created_at.desc())).all()
        return [{"id": row.id, "project_id": row.project_id, "email": row.email,
                 "role": row.role, "status": row.status, "invited_by": row.invited_by,
                 "expires_at": row.expires_at, "created_at": row.created_at}
                for row in rows]

    def accept_invitation(self, project_id: str, raw_token: str, user: User) -> dict:
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        db = self.project_repo.db
        invitation = db.scalar(select(ProjectInvitation).where(
            ProjectInvitation.token_hash == token_hash
        ))
        if not invitation:
            raise ResourceNotFoundError("Invitation")
        if invitation.project_id != project_id:
            raise ResourceNotFoundError("Invitation")
        if invitation.status != "pending":
            raise ConflictError("Invitation is no longer pending")
        expires_at = invitation.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at <= datetime.now(timezone.utc):
            invitation.status = "expired"
            invitation.responded_at = datetime.now(timezone.utc)
            db.commit()
            raise ConflictError("Invitation has expired")
        if user.email.strip().lower() != invitation.email:
            raise AuthorisationError("Invitation was sent to a different email address")
        if self.project_repo.get_membership(invitation.project_id, user.id):
            raise ConflictError("User is already a project member")
        db.add(ProjectMember(id=self.project_repo.new_id(), project_id=invitation.project_id,
                             user_id=user.id, role=invitation.role))
        invitation.status = "accepted"
        invitation.responded_at = datetime.now(timezone.utc)
        self.audit_repo.record(user.id, "project.invitation.accept", "project",
                               invitation.project_id, {"invitation_id": invitation.id,
                                                       "role": invitation.role})
        db.commit()
        return {"project_id": invitation.project_id, "user_id": user.id, "role": invitation.role,
                "invitation_status": invitation.status}

    def revoke_invitation(self, project_id: str, invitation_id: str, user: User) -> None:
        project = self.get_project_or_fail(project_id, user, write=True)
        self._assert_project_manager(project, user)
        invitation = self.project_repo.db.get(ProjectInvitation, invitation_id)
        if not invitation or invitation.project_id != project_id:
            raise ResourceNotFoundError("Invitation", invitation_id)
        if invitation.status != "pending":
            raise ConflictError("Only pending invitations can be revoked")
        invitation.status = "revoked"
        invitation.responded_at = datetime.now(timezone.utc)
        self.audit_repo.record(user.id, "project.invitation.revoke", "project", project_id,
                               {"invitation_id": invitation_id})
        self.project_repo.commit()

    def project_activity(self, project_id: str, user: User, limit: int = 100) -> list[dict]:
        self.get_project_or_fail(project_id, user)
        from app.domain.models import Artifact, AuditLog, Requirement

        db = self.project_repo.db
        requirement_ids = select(Requirement.id).where(Requirement.project_id == project_id)
        artifact_ids = select(Artifact.id).where(Artifact.project_id == project_id)
        rows = db.execute(
            select(AuditLog, User)
            .outerjoin(User, User.id == AuditLog.user_id)
            .where(
                ((AuditLog.resource_type == "project") & (AuditLog.resource_id == project_id))
                | ((AuditLog.resource_type == "requirement") &
                   AuditLog.resource_id.in_(requirement_ids))
                | ((AuditLog.resource_type == "artifact") & AuditLog.resource_id.in_(artifact_ids))
            )
            .order_by(AuditLog.created_at.desc())
            .limit(limit)
        ).all()
        return [{"id": event.id, "user_id": event.user_id,
                 "user_name": actor.full_name if actor else None,
                 "user_email": actor.email if actor else None,
                 "action": event.action, "resource_type": event.resource_type,
                 "resource_id": event.resource_id, "details": event.details,
                 "created_at": event.created_at} for event, actor in rows]
