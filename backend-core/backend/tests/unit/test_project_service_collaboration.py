from datetime import datetime, timedelta, timezone

import pytest

from app.core.exceptions import (
    AuthorisationError,
    ConflictError,
    ResourceNotFoundError,
    ValidationError,
)
from app.domain.models import ProjectMember


def test_list_for_user_limits_projects_unless_platform_admin(project_service, pm_user, dev_user, admin_user):
    owned = project_service.create("Owned", "", pm_user)
    shared = project_service.create("Shared", "", pm_user)
    private = project_service.create("Private", "", pm_user)
    project_service.set_member(shared.id, dev_user.email, "viewer", pm_user)

    assert {project.id for project in project_service.list_for_user(dev_user)} == {shared.id}
    assert {project.id for project in project_service.list_for_user(admin_user)} == {
        owned.id,
        shared.id,
        private.id,
    }


def test_viewer_can_read_but_cannot_write_project(project_service, pm_user, dev_user):
    project = project_service.create("Shared", "", pm_user)
    project_service.set_member(project.id, dev_user.email, "viewer", pm_user)

    assert project_service.get_project_or_fail(project.id, dev_user).id == project.id
    with pytest.raises(AuthorisationError):
        project_service.get_project_or_fail(project.id, dev_user, write=True)


def test_viewer_cannot_manage_team_and_editor_cannot_delete_project(
    project_service, pm_user, dev_user
):
    project = project_service.create("Shared", "", pm_user)
    project_service.set_member(project.id, dev_user.email, "viewer", pm_user)

    with pytest.raises(AuthorisationError, match="Only the project owner"):
        project_service.set_member(project.id, "new@example.test", "editor", dev_user)

    project_service.update_member_role(project.id, dev_user.id, "editor", pm_user)
    with pytest.raises(AuthorisationError, match="Only the project owner"):
        project_service.delete(project.id, dev_user)


def test_set_member_does_not_reassign_orphaned_owner_role(
    project_service, project_repo, pm_user, dev_user
):
    project = project_service.create("Team", "", pm_user)
    project_repo.add_member(
        ProjectMember(
            id=project_repo.new_id(),
            project_id=project.id,
            user_id=dev_user.id,
            role="owner",
        )
    )
    project_repo.commit()

    with pytest.raises(ConflictError, match="owner role cannot be changed"):
        project_service.set_member(project.id, dev_user.email, "editor", pm_user)


def test_set_member_normalizes_role_and_updates_existing_membership(project_service, pm_user, dev_user):
    project = project_service.create("Shared", "", pm_user)

    first = project_service.set_member(project.id, dev_user.email.upper(), "VIEWER", pm_user)
    updated = project_service.set_member(project.id, dev_user.email, "EDITOR", pm_user)

    assert first["role"] == "viewer"
    assert updated == {"project_id": project.id, "user_id": dev_user.id, "role": "editor"}


def test_set_member_rejects_unknown_owner_and_inactive_accounts(
    project_service, project_repo, pm_user, dev_user, db_session
):
    project = project_service.create("Team", "", pm_user)

    with pytest.raises(ResourceNotFoundError):
        project_service.set_member(project.id, "missing@example.test", "viewer", pm_user)
    with pytest.raises(ConflictError):
        project_service.set_member(project.id, pm_user.email, "viewer", pm_user)

    dev_user.is_active = False
    db_session.commit()
    with pytest.raises(ConflictError, match="Inactive users"):
        project_service.set_member(project.id, dev_user.email, "viewer", pm_user)


def test_only_owner_or_platform_admin_can_assign_project_admin(
    project_service, pm_user, dev_user, admin_user
):
    project = project_service.create("Team", "", pm_user)

    with pytest.raises(AuthorisationError):
        project_service.set_member(project.id, dev_user.email, "admin", dev_user)

    assert project_service.set_member(project.id, dev_user.email, "admin", admin_user)["role"] == "admin"


def test_list_members_reports_owner_membership_and_manager_permissions(
    project_service, pm_user, dev_user
):
    project = project_service.create("Team", "", pm_user)
    project_service.set_member(project.id, dev_user.email, "viewer", pm_user)

    owner_view = project_service.list_members(project.id, pm_user)
    viewer_view = project_service.list_members(project.id, dev_user)

    assert owner_view["current_role"] == "owner"
    assert owner_view["can_manage_members"] is True
    assert owner_view["can_manage_admins"] is True
    assert [member["role"] for member in owner_view["members"]] == ["owner", "viewer"]
    assert viewer_view["current_role"] == "viewer"
    assert viewer_view["can_manage_members"] is False
    assert viewer_view["invitations"] == []


def test_list_members_recovers_owner_and_limits_admin_management(
    project_service, project_repo, pm_user, dev_user
):
    project = project_service.create("Team", "", pm_user)
    project_service.set_member(project.id, dev_user.email, "admin", pm_user)
    owner_membership = project_repo.get_membership(project.id, pm_user.id)
    project_repo.delete(owner_membership)
    project_repo.commit()

    members = project_service.list_members(project.id, dev_user)

    assert members["current_role"] == "admin"
    assert members["can_manage_members"] is True
    assert members["can_manage_admins"] is False
    assert any(member["user_id"] == pm_user.id and member["role"] == "owner" for member in members["members"])


def test_list_members_marks_expired_pending_invitations(
    project_service, project_repo, pm_user, db_session
):
    project = project_service.create("Team", "", pm_user)
    invitation = project_service.invite_member(project.id, "new@example.test", "editor", pm_user)
    stored = project_repo.get_invitation_for_email(project.id, "new@example.test")
    stored.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    project_repo.commit()
    db_session.expire_all()

    members = project_service.list_members(project.id, pm_user)

    assert members["invitations"][0]["id"] == invitation["id"]
    assert members["invitations"][0]["status"] == "expired"


def test_invite_member_normalizes_email_and_reuses_pending_invitation(
    project_service, pm_user
):
    project = project_service.create("Team", "", pm_user)

    first = project_service.invite_member(project.id, "  New@Example.Test ", "editor", pm_user)
    second = project_service.invite_member(project.id, "new@example.test", "viewer", pm_user)

    assert first["email"] == "new@example.test"
    assert second["id"] == first["id"]
    assert second["role"] == "viewer"
    assert second["token"] != first["token"]
    assert second["expires_at"] > first["expires_at"]


def test_invite_member_reopens_expired_invitation(project_service, project_repo, pm_user):
    project = project_service.create("Team", "", pm_user)
    first = project_service.invite_member(project.id, "new@example.test", "editor", pm_user)
    stored = project_repo.get_invitation_for_email(project.id, "new@example.test")
    stored.status = "expired"
    stored.accepted_at = datetime.now(timezone.utc) - timedelta(days=1)
    project_repo.commit()

    reopened = project_service.invite_member(project.id, "new@example.test", "viewer", pm_user)

    assert reopened["id"] == first["id"]
    assert reopened["role"] == "viewer"
    assert project_repo.get_invitation_for_email(project.id, "new@example.test").status == "pending"
    assert project_repo.get_invitation_for_email(project.id, "new@example.test").accepted_at is None


def test_invite_member_rejects_current_members_and_invalid_roles(
    project_service, pm_user, dev_user
):
    project = project_service.create("Team", "", pm_user)

    with pytest.raises(ValidationError):
        project_service.invite_member(project.id, "new@example.test", "owner", pm_user)
    with pytest.raises(ConflictError, match="already a member"):
        project_service.invite_member(project.id, pm_user.email, "editor", pm_user)

    project_service.set_member(project.id, dev_user.email, "viewer", pm_user)
    with pytest.raises(ConflictError, match="already a project member"):
        project_service.invite_member(project.id, dev_user.email, "editor", pm_user)


def test_project_admin_cannot_invite_another_admin_or_invite_inactive_user(
    project_service, pm_user, dev_user, ba_user, tester_user, db_session
):
    project = project_service.create("Team", "", pm_user)
    project_service.set_member(project.id, dev_user.email, "admin", pm_user)

    with pytest.raises(AuthorisationError, match="invite a project admin"):
        project_service.invite_member(project.id, "new@example.test", "admin", dev_user)

    ba_user.is_active = False
    db_session.commit()
    with pytest.raises(ConflictError, match="Inactive users"):
        project_service.invite_member(project.id, ba_user.email, "viewer", pm_user)

    assert tester_user.is_active


def test_accept_invitation_checks_token_expiry_and_invited_email(
    project_service, project_repo, pm_user, dev_user, tester_user
):
    project = project_service.create("Team", "", pm_user)

    with pytest.raises(ResourceNotFoundError):
        project_service.accept_invitation("unknown-token", dev_user)

    expired = project_service.invite_member(project.id, dev_user.email, "editor", pm_user)
    stored = project_repo.get_invitation_for_email(project.id, dev_user.email)
    stored.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    project_repo.commit()
    with pytest.raises(ConflictError, match="expired"):
        project_service.accept_invitation(expired["token"], dev_user)
    assert project_repo.get_invitation_for_email(project.id, dev_user.email).status == "expired"

    active = project_service.invite_member(project.id, tester_user.email, "viewer", pm_user)
    with pytest.raises(AuthorisationError, match="email address"):
        project_service.accept_invitation(active["token"], dev_user)


def test_accept_invitation_adds_member_and_is_single_use(project_service, pm_user, dev_user):
    project = project_service.create("Team", "", pm_user)
    invitation = project_service.invite_member(project.id, dev_user.email, "editor", pm_user)

    accepted = project_service.accept_invitation(invitation["token"], dev_user)

    assert accepted == {
        "project_id": project.id,
        "project_name": "Team",
        "role": "editor",
    }
    assert project_service.get_project_or_fail(project.id, dev_user, write=True).id == project.id
    with pytest.raises(ConflictError, match="no longer active"):
        project_service.accept_invitation(invitation["token"], dev_user)


def test_accept_invitation_rejects_a_user_who_joined_after_the_invite(
    project_service, project_repo, pm_user, dev_user
):
    project = project_service.create("Team", "", pm_user)
    invitation = project_service.invite_member(project.id, dev_user.email, "editor", pm_user)
    project_repo.add_member(
        ProjectMember(
            id=project_repo.new_id(),
            project_id=project.id,
            user_id=dev_user.id,
            role="viewer",
        )
    )
    project_repo.commit()

    with pytest.raises(ConflictError, match="already a member"):
        project_service.accept_invitation(invitation["token"], dev_user)


def test_accept_invitation_reports_project_removed_after_invitation(
    project_service, project_repo, pm_user, dev_user, monkeypatch
):
    project = project_service.create("Team", "", pm_user)
    invitation = project_service.invite_member(project.id, dev_user.email, "editor", pm_user)
    monkeypatch.setattr(project_repo, "get", lambda project_id: None)

    with pytest.raises(ResourceNotFoundError, match="Project"):
        project_service.accept_invitation(invitation["token"], dev_user)


def test_revoke_invitation_requires_matching_pending_invitation(
    project_service, pm_user, dev_user
):
    project = project_service.create("Team", "", pm_user)
    invitation = project_service.invite_member(project.id, "new@example.test", "viewer", pm_user)

    with pytest.raises(ResourceNotFoundError):
        project_service.revoke_invitation(project.id, "missing", pm_user)
    other_project = project_service.create("Other", "", pm_user)
    with pytest.raises(ResourceNotFoundError):
        project_service.revoke_invitation(other_project.id, invitation["id"], pm_user)
    with pytest.raises(AuthorisationError):
        project_service.revoke_invitation(project.id, invitation["id"], dev_user)

    project_service.revoke_invitation(project.id, invitation["id"], pm_user)
    with pytest.raises(ConflictError, match="pending"):
        project_service.revoke_invitation(project.id, invitation["id"], pm_user)


def test_member_role_update_and_removal_enforce_owner_and_admin_rules(
    project_service, project_repo, pm_user, dev_user, admin_user
):
    project = project_service.create("Team", "", pm_user)
    project_service.set_member(project.id, dev_user.email, "viewer", pm_user)

    with pytest.raises(ValidationError):
        project_service.update_member_role(project.id, dev_user.id, "owner", pm_user)
    with pytest.raises(ConflictError):
        project_service.update_member_role(project.id, pm_user.id, "editor", pm_user)

    updated = project_service.update_member_role(project.id, dev_user.id, "EDITOR", pm_user)
    assert updated["role"] == "editor"
    project_service.remove_member(project.id, dev_user.id, pm_user)
    assert project_repo.get_membership(project.id, dev_user.id) is None

    with pytest.raises(ResourceNotFoundError):
        project_service.remove_member(project.id, dev_user.id, pm_user)
    with pytest.raises(ConflictError):
        project_service.remove_member(project.id, pm_user.id, pm_user)
    assert project_service.list_for_user(admin_user)


def test_project_admin_can_manage_members_but_cannot_change_another_admin(
    project_service, pm_user, dev_user, tester_user, ba_user
):
    project = project_service.create("Team", "", pm_user)
    project_service.set_member(project.id, dev_user.email, "admin", pm_user)
    project_service.set_member(project.id, tester_user.email, "admin", pm_user)
    with pytest.raises(AuthorisationError, match="assign the Admin role"):
        project_service.set_member(project.id, "new@example.test", "admin", dev_user)
    with pytest.raises(AuthorisationError, match="change a project admin's role"):
        project_service.set_member(project.id, tester_user.email, "editor", dev_user)
    project_service.set_member(project.id, ba_user.email, "viewer", pm_user)
    with pytest.raises(AuthorisationError, match="assign the Admin role"):
        project_service.update_member_role(project.id, ba_user.id, "admin", dev_user)
    with pytest.raises(ResourceNotFoundError, match="Project member"):
        project_service.update_member_role(project.id, "missing-member", "editor", pm_user)

    with pytest.raises(AuthorisationError, match="project admin's role"):
        project_service.update_member_role(project.id, tester_user.id, "editor", dev_user)
    with pytest.raises(AuthorisationError, match="remove a project admin"):
        project_service.remove_member(project.id, tester_user.id, dev_user)

    assert project_service.update_member_role(project.id, tester_user.id, "editor", pm_user)["role"] == "editor"
    project_service.remove_member(project.id, tester_user.id, pm_user)


def test_list_activity_is_scoped_to_project_access(project_service, pm_user, dev_user):
    project = project_service.create("Activity", "", pm_user)

    events = project_service.list_activity(project.id, pm_user)

    assert any(event["action"] == "project.create" for event in events)
    with pytest.raises(AuthorisationError):
        project_service.list_activity(project.id, dev_user)
