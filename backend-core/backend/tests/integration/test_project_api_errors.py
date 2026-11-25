"""Error-path coverage for the project and task routers.

These tests exercise every HTTPException translation in ``app/api/v1/projects.py``
plus the unknown-project guard in ``app/api/v1/tasks.py``.
"""

from app.api.deps import get_project_service
from app.core.exceptions import ValidationError
from app.main import app


def _create_project(client, headers, name="Error paths"):
    response = client.post("/api/v1/projects", json={"name": name}, headers=headers)
    assert response.status_code == 201
    return response.json()["id"]


def _register(client, email):
    response = client.post(
        "/api/v1/auth/register",
        json={"email": email, "full_name": "Error path user", "password": "TestPass123!"},
    )
    assert response.status_code == 201
    token = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "TestPass123!"},
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_accept_invitation_unknown_token_returns_404(client, pm_headers):
    response = client.post(
        "/api/v1/projects/invitations/accept",
        json={"token": "unknown-invitation-token-value"},
        headers=pm_headers,
    )
    assert response.status_code == 404


def test_update_project_missing_and_forbidden(client, pm_headers):
    assert client.patch(
        "/api/v1/projects/missing-project", json={"name": "Renamed"}, headers=pm_headers
    ).status_code == 404

    project_id = _create_project(client, pm_headers)
    outsider = _register(client, "update.outsider@example.com")
    assert client.patch(
        f"/api/v1/projects/{project_id}", json={"name": "Renamed"}, headers=outsider
    ).status_code == 403


def test_delete_project_missing_and_forbidden(client, pm_headers):
    assert client.delete(
        "/api/v1/projects/missing-project", headers=pm_headers
    ).status_code == 404

    project_id = _create_project(client, pm_headers)
    outsider = _register(client, "delete.outsider@example.com")
    assert client.delete(f"/api/v1/projects/{project_id}", headers=outsider).status_code == 403


def test_add_member_requires_project_access(client, pm_headers):
    project_id = _create_project(client, pm_headers)
    outsider = _register(client, "member.outsider@example.com")

    response = client.post(
        f"/api/v1/projects/{project_id}/members?email=someone@example.com&role=viewer",
        headers=outsider,
    )
    assert response.status_code == 403


def test_list_members_missing_and_forbidden(client, pm_headers):
    assert client.get(
        "/api/v1/projects/missing-project/members", headers=pm_headers
    ).status_code == 404

    project_id = _create_project(client, pm_headers)
    outsider = _register(client, "list.outsider@example.com")
    assert client.get(
        f"/api/v1/projects/{project_id}/members", headers=outsider
    ).status_code == 403


def test_invite_member_missing_project_and_conflict(client, pm_headers, pm_user):
    assert client.post(
        "/api/v1/projects/missing-project/invitations",
        json={"email": "new@example.com", "role": "viewer"},
        headers=pm_headers,
    ).status_code == 404

    project_id = _create_project(client, pm_headers)
    conflict = client.post(
        f"/api/v1/projects/{project_id}/invitations",
        json={"email": pm_user.email, "role": "viewer"},
        headers=pm_headers,
    )
    assert conflict.status_code == 409


def test_update_member_role_errors(client, pm_headers, pm_user):
    project_id = _create_project(client, pm_headers)
    outsider = _register(client, "role.outsider@example.com")

    assert client.patch(
        f"/api/v1/projects/{project_id}/members/missing-member",
        json={"role": "editor"},
        headers=pm_headers,
    ).status_code == 404
    assert client.patch(
        f"/api/v1/projects/{project_id}/members/{pm_user.id}",
        json={"role": "editor"},
        headers=outsider,
    ).status_code == 403
    assert client.patch(
        f"/api/v1/projects/{project_id}/members/{pm_user.id}",
        json={"role": "editor"},
        headers=pm_headers,
    ).status_code == 409


def test_remove_member_errors(client, pm_headers, pm_user):
    project_id = _create_project(client, pm_headers)
    outsider = _register(client, "remove.outsider@example.com")

    assert client.delete(
        f"/api/v1/projects/{project_id}/members/missing-member", headers=pm_headers
    ).status_code == 404
    assert client.delete(
        f"/api/v1/projects/{project_id}/members/{pm_user.id}", headers=outsider
    ).status_code == 403
    assert client.delete(
        f"/api/v1/projects/{project_id}/members/{pm_user.id}", headers=pm_headers
    ).status_code == 409


def test_revoke_invitation_errors(client, pm_headers):
    project_id = _create_project(client, pm_headers)
    outsider = _register(client, "revoke.outsider@example.com")

    assert client.delete(
        f"/api/v1/projects/{project_id}/invitations/missing-invitation", headers=pm_headers
    ).status_code == 404
    assert client.delete(
        f"/api/v1/projects/{project_id}/invitations/missing-invitation", headers=outsider
    ).status_code == 403

    invitation = client.post(
        f"/api/v1/projects/{project_id}/invitations",
        json={"email": "revoke@example.com", "role": "viewer"},
        headers=pm_headers,
    ).json()
    assert client.delete(
        f"/api/v1/projects/{project_id}/invitations/{invitation['id']}", headers=pm_headers
    ).status_code == 204
    assert client.delete(
        f"/api/v1/projects/{project_id}/invitations/{invitation['id']}", headers=pm_headers
    ).status_code == 409


def test_activity_and_history_errors(client, pm_headers):
    assert client.get(
        "/api/v1/projects/missing-project/activity", headers=pm_headers
    ).status_code == 404
    assert client.get(
        "/api/v1/projects/missing-project/history", headers=pm_headers
    ).status_code == 404

    project_id = _create_project(client, pm_headers)
    outsider = _register(client, "history.outsider@example.com")
    assert client.get(
        f"/api/v1/projects/{project_id}/history", headers=outsider
    ).status_code == 403


def test_invite_and_role_update_map_service_validation_errors(client, pm_headers):
    """Schema validation blocks invalid roles, so stub the service to reach the handlers."""

    class _ValidationService:
        def invite_member(self, *args, **kwargs):
            raise ValidationError("Invitation role must be admin, editor, or viewer")

        def update_member_role(self, *args, **kwargs):
            raise ValidationError("Role must be admin, editor, or viewer")

    app.dependency_overrides[get_project_service] = lambda: _ValidationService()
    try:
        invite = client.post(
            "/api/v1/projects/any-project/invitations",
            json={"email": "valid@example.com", "role": "viewer"},
            headers=pm_headers,
        )
        assert invite.status_code == 422

        update = client.patch(
            "/api/v1/projects/any-project/members/any-member",
            json={"role": "editor"},
            headers=pm_headers,
        )
        assert update.status_code == 422
    finally:
        app.dependency_overrides.pop(get_project_service, None)


def test_task_endpoints_return_404_for_unknown_project(client, dev_headers):
    assert client.get(
        "/api/v1/projects/missing-project/tasks", headers=dev_headers
    ).status_code == 404
    assert client.post(
        "/api/v1/projects/missing-project/tasks", json={"title": "Nope"}, headers=dev_headers
    ).status_code == 404
    assert client.patch(
        "/api/v1/projects/missing-project/tasks/task-id", json={"status": "done"}, headers=dev_headers
    ).status_code == 404
    assert client.delete(
        "/api/v1/projects/missing-project/tasks/task-id", headers=dev_headers
    ).status_code == 404
