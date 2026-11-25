"""Project lifecycle, collaboration, invitations, and access-control rules."""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from app.core.exceptions import AuthorisationError, ConflictError, ResourceNotFoundError, ValidationError
from app.domain.models import Project, ProjectInvitation, ProjectMember, User
from app.repositories.audit_repo import AuditRepository
from app.repositories.project_repo import ProjectRepository
from app.repositories.user_repo import UserRepository


class ProjectService:
    INVITATION_TTL = timedelta(days=7)
    MEMBER_ROLES = {"admin", "editor", "viewer"}

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

        # The platform administrator and the project owner always pass.
        if project.owner_id == user.id or user.role.lower() == "admin":
            return project

        member = self.project_repo.get_membership(project_id, user.id)
        if not member or (write and member.role not in ("owner", "admin", "editor")):
            raise AuthorisationError("You do not have access to this project")

        return project

    @staticmethod
    def _is_platform_admin(user: User) -> bool:
        return user.role.lower() == "admin"

    def _is_project_manager(self, project: Project, user: User) -> bool:
        if self._is_platform_admin(user) or project.owner_id == user.id:
            return True
        membership = self.project_repo.get_membership(project.id, user.id)
        return bool(membership and membership.role in {"owner", "admin"})

    def _assert_project_manager(self, project: Project, user: User) -> None:
        if not self._is_project_manager(project, user):
            raise AuthorisationError("Only the project owner or a project admin can manage the team")

    def _assert_owner_or_platform_admin(self, project: Project, user: User) -> None:
        if not self._is_platform_admin(user) and project.owner_id != user.id:
            raise AuthorisationError("Only the project owner can perform this action")

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
        if self._is_platform_admin(user):
            return self.project_repo.list_all()
        return self.project_repo.list_for_user(user.id)

    def update(
        self, project_id: str, user: User, updates: dict
    ) -> Project:
        project = self.get_project_or_fail(project_id, user, write=True)
        self._assert_project_manager(project, user)

        for key, value in updates.items():
            setattr(project, key, value)

        self.audit_repo.record(user.id, "project.update", "project", project.id)
        self.project_repo.commit()
        return self.project_repo.refresh(project)

    def delete(self, project_id: str, user: User) -> None:
        project = self.get_project_or_fail(project_id, user, write=True)
        self._assert_owner_or_platform_admin(project, user)

        self.audit_repo.record(user.id, "project.delete", "project", project.id)
        self.project_repo.delete(project)
        self.project_repo.commit()

    # ── Membership ──────────────────────────────────────────────────────

    def set_member(
        self, project_id: str, email: str, role: str, user: User
    ) -> dict:
        project = self.get_project_or_fail(project_id, user)
        self._assert_project_manager(project, user)

        role = role.lower()
        if role not in self.MEMBER_ROLES:
            raise ValidationError("Role must be editor or viewer, or admin (owner only)")
        if role == "admin" and not self._is_platform_admin(user) and project.owner_id != user.id:
            raise AuthorisationError("Only the project owner can assign the Admin role")

        member_user = self.user_repo.get_by_email(email.lower())
        if not member_user:
            raise ResourceNotFoundError("User")
        if member_user.id == project.owner_id:
            raise ConflictError("The project owner role cannot be changed")
        if not member_user.is_active:
            raise ConflictError("Inactive users cannot be added to a project")

        existing = self.project_repo.get_membership(project_id, member_user.id)
        if existing:
            if existing.role == "owner":
                raise ConflictError("The project owner role cannot be changed")
            if existing.role == "admin" and not self._is_platform_admin(user) and project.owner_id != user.id:
                raise AuthorisationError("Only the project owner can change a project admin's role")
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
            "project.member.role_changed",
            "project",
            project_id,
            {"member_id": member_user.id, "email": member_user.email, "role": role},
        )
        self.project_repo.commit()
        return {
            "project_id": project_id,
            "user_id": member_user.id,
            "role": membership.role,
        }

    def list_members(self, project_id: str, user: User) -> dict:
        project = self.get_project_or_fail(project_id, user)
        members = [
            {
                "user_id": member.user_id,
                "email": member_user.email,
                "full_name": member_user.full_name,
                "role": member.role,
                "joined_at": member.created_at,
                "is_current_user": member.user_id == user.id,
            }
            for member, member_user in self.project_repo.list_members(project_id)
        ]
        if not any(item["user_id"] == project.owner_id for item in members):
            owner = self.user_repo.get(project.owner_id)
            if owner:
                members.append({
                    "user_id": owner.id,
                    "email": owner.email,
                    "full_name": owner.full_name,
                    "role": "owner",
                    "joined_at": project.created_at,
                    "is_current_user": owner.id == user.id,
                })
        members.sort(key=lambda item: (item["role"] != "owner", item["email"].lower()))

        is_platform_admin = self._is_platform_admin(user)
        is_owner = project.owner_id == user.id
        membership = self.project_repo.get_membership(project_id, user.id)
        current_role = "admin" if is_platform_admin and not is_owner else (
            "owner" if is_owner else membership.role if membership else "viewer"
        )
        can_manage = self._is_project_manager(project, user)
        invitations = []
        if can_manage:
            now = datetime.now(timezone.utc)
            invitations = []
            for invitation in self.project_repo.list_invitations(project_id):
                expires_at = invitation.expires_at
                if expires_at.tzinfo is None:
                    expires_at = expires_at.replace(tzinfo=timezone.utc)
                invitation_status = "expired" if invitation.status == "pending" and expires_at <= now else invitation.status
                invitations.append({
                    "id": invitation.id,
                    "email": invitation.email,
                    "role": invitation.role,
                    "status": invitation_status,
                    "created_at": invitation.created_at,
                    "expires_at": invitation.expires_at,
                })
        return {
            "project_id": project_id,
            "current_role": current_role,
            "can_manage_members": can_manage,
            "can_manage_admins": is_owner or is_platform_admin,
            "members": members,
            "invitations": invitations,
        }

    def update_member_role(self, project_id: str, member_id: str, role: str, user: User) -> dict:
        project = self.get_project_or_fail(project_id, user)
        self._assert_project_manager(project, user)
        role = role.lower()
        if role not in self.MEMBER_ROLES:
            raise ValidationError("Role must be admin, editor, or viewer")
        if role == "admin" and not self._is_platform_admin(user) and project.owner_id != user.id:
            raise AuthorisationError("Only the project owner can assign the Admin role")

        membership = self.project_repo.get_membership(project_id, member_id)
        if not membership:
            raise ResourceNotFoundError("Project member", member_id)
        if membership.user_id == project.owner_id or membership.role == "owner":
            raise ConflictError("The project owner role cannot be changed")
        if membership.role == "admin" and not self._is_platform_admin(user) and project.owner_id != user.id:
            raise AuthorisationError("Only the project owner can change a project admin's role")
        membership.role = role
        member_user = self.user_repo.get(membership.user_id)
        self.audit_repo.record(
            user.id, "project.member.role_changed", "project", project_id,
            {"member_id": membership.user_id, "email": member_user.email if member_user else "", "role": role},
        )
        self.project_repo.commit()
        return {"project_id": project_id, "user_id": membership.user_id, "role": role}

    def remove_member(self, project_id: str, member_id: str, user: User) -> None:
        project = self.get_project_or_fail(project_id, user)
        self._assert_project_manager(project, user)
        membership = self.project_repo.get_membership(project_id, member_id)
        if not membership:
            raise ResourceNotFoundError("Project member", member_id)
        if membership.user_id == project.owner_id or membership.role == "owner":
            raise ConflictError("The project owner cannot be removed from the project")
        if membership.role == "admin" and not self._is_platform_admin(user) and project.owner_id != user.id:
            raise AuthorisationError("Only the project owner can remove a project admin")
        member_user = self.user_repo.get(membership.user_id)
        self.project_repo.delete(membership)
        self.audit_repo.record(
            user.id, "project.member.removed", "project", project_id,
            {"member_id": membership.user_id, "email": member_user.email if member_user else ""},
        )
        self.project_repo.commit()

    @staticmethod
    def _hash_invitation_token(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    def invite_member(self, project_id: str, email: str, role: str, user: User) -> dict:
        project = self.get_project_or_fail(project_id, user)
        self._assert_project_manager(project, user)
        role = role.lower()
        if role not in self.MEMBER_ROLES:
            raise ValidationError("Invitation role must be admin, editor, or viewer")
        if role == "admin" and not self._is_platform_admin(user) and project.owner_id != user.id:
            raise AuthorisationError("Only the project owner can invite a project admin")

        normalized_email = email.strip().lower()
        invited_user = self.user_repo.get_by_email(normalized_email)
        if invited_user and invited_user.id == user.id:
            raise ConflictError("You are already a member of this project")
        if invited_user and self.project_repo.get_membership(project_id, invited_user.id):
            raise ConflictError("This user is already a project member")
        if invited_user and not invited_user.is_active:
            raise ConflictError("Inactive users cannot be invited to a project")

        raw_token = secrets.token_urlsafe(32)
        now = datetime.now(timezone.utc)
        invitation = self.project_repo.get_invitation_for_email(project_id, normalized_email)
        invitation_expires_at = invitation.expires_at if invitation else None
        if invitation_expires_at and invitation_expires_at.tzinfo is None:
            invitation_expires_at = invitation_expires_at.replace(tzinfo=timezone.utc)
        if invitation and invitation.status == "pending" and invitation_expires_at > now:
            invitation.role = role
            invitation.token_hash = self._hash_invitation_token(raw_token)
            invitation.invited_by = user.id
            invitation.created_at = now
            invitation.expires_at = now + self.INVITATION_TTL
        elif invitation:
            invitation.role = role
            invitation.token_hash = self._hash_invitation_token(raw_token)
            invitation.invited_by = user.id
            invitation.status = "pending"
            invitation.created_at = now
            invitation.expires_at = now + self.INVITATION_TTL
            invitation.accepted_at = None
        else:
            invitation = ProjectInvitation(
                id=self.project_repo.new_id(),
                project_id=project_id,
                email=normalized_email,
                role=role,
                token_hash=self._hash_invitation_token(raw_token),
                invited_by=user.id,
                status="pending",
                created_at=now,
                expires_at=now + self.INVITATION_TTL,
            )
            self.project_repo.add(invitation)

        self.audit_repo.record(
            user.id, "project.invitation.created", "project", project_id,
            {"email": normalized_email, "role": role, "invitation_id": invitation.id},
        )
        self.project_repo.commit()
        return {
            "id": invitation.id,
            "project_id": project_id,
            "email": normalized_email,
            "role": role,
            "status": "pending",
            "token": raw_token,
            "expires_at": invitation.expires_at,
        }

    def accept_invitation(self, token: str, user: User) -> dict:
        token_hash = self._hash_invitation_token(token)
        invitation = self.project_repo.get_invitation_by_hash(token_hash)
        if not invitation:
            raise ResourceNotFoundError("Invitation")
        if invitation.status != "pending":
            raise ConflictError("This invitation is no longer active")
        now = datetime.now(timezone.utc)
        expires_at = invitation.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at <= now:
            invitation.status = "expired"
            self.project_repo.commit()
            raise ConflictError("This invitation has expired")
        if user.email.strip().lower() != invitation.email:
            raise AuthorisationError("Sign in with the email address this invitation was sent to")
        project = self.project_repo.get(invitation.project_id)
        if not project:
            raise ResourceNotFoundError("Project", invitation.project_id)
        if self.project_repo.get_membership(project.id, user.id):
            raise ConflictError("You are already a member of this project")

        self.project_repo.add_member(ProjectMember(
            id=self.project_repo.new_id(),
            project_id=project.id,
            user_id=user.id,
            role=invitation.role,
        ))
        invitation.status = "accepted"
        invitation.accepted_at = now
        self.audit_repo.record(
            user.id, "project.invitation.accepted", "project", project.id,
            {"email": user.email, "role": invitation.role, "invitation_id": invitation.id},
        )
        self.project_repo.commit()
        return {"project_id": project.id, "project_name": project.name, "role": invitation.role}

    def revoke_invitation(self, project_id: str, invitation_id: str, user: User) -> None:
        project = self.get_project_or_fail(project_id, user)
        self._assert_project_manager(project, user)
        invitation = self.project_repo.get_invitation_by_id(invitation_id)
        if not invitation or invitation.project_id != project_id:
            raise ResourceNotFoundError("Invitation", invitation_id)
        if invitation.status != "pending":
            raise ConflictError("Only pending invitations can be revoked")
        invitation.status = "revoked"
        self.audit_repo.record(
            user.id, "project.invitation.revoked", "project", project_id,
            {"email": invitation.email, "invitation_id": invitation.id},
        )
        self.project_repo.commit()

    def list_activity(self, project_id: str, user: User, limit: int = 100) -> list[dict]:
        self.get_project_or_fail(project_id, user)
        return self.audit_repo.list_for_project(project_id, limit)
