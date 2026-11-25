"""End-to-end coverage for project teams, invitations, and activity."""


def _create_project(client, headers):
    response = client.post("/api/v1/projects", json={"name": "Shared project"}, headers=headers)
    assert response.status_code == 201
    return response.json()["id"]


def _register(client, email):
    response = client.post("/api/v1/auth/register", json={
        "email": email,
        "full_name": "New teammate",
        "password": "TestPass123!",
    })
    assert response.status_code == 201
    token = client.post("/api/v1/auth/login", json={
        "email": email,
        "password": "TestPass123!",
    }).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_invitation_acceptance_and_activity_lifecycle(client, pm_headers):
    project_id = _create_project(client, pm_headers)

    team = client.get(f"/api/v1/projects/{project_id}/members", headers=pm_headers).json()
    assert team["current_role"] == "owner"
    assert team["can_manage_members"] is True
    assert [member["role"] for member in team["members"]] == ["owner"]

    invited = client.post(
        f"/api/v1/projects/{project_id}/invitations",
        json={"email": "new.member@example.com", "role": "editor"},
        headers=pm_headers,
    )
    assert invited.status_code == 201
    invitation = invited.json()
    assert invitation["email"] == "new.member@example.com"
    assert invitation["status"] == "pending"
    assert len(invitation["token"]) >= 32

    wrong_user = _register(client, "wrong.user@example.com")
    denied = client.post(
        "/api/v1/projects/invitations/accept",
        json={"token": invitation["token"]},
        headers=wrong_user,
    )
    assert denied.status_code == 403

    invitee_headers = _register(client, "new.member@example.com")
    accepted = client.post(
        "/api/v1/projects/invitations/accept",
        json={"token": invitation["token"]},
        headers=invitee_headers,
    )
    assert accepted.status_code == 200
    assert accepted.json()["role"] == "editor"
    assert client.get(f"/api/v1/projects/{project_id}", headers=invitee_headers).status_code == 200

    team = client.get(f"/api/v1/projects/{project_id}/members", headers=invitee_headers).json()
    assert team["current_role"] == "editor"
    assert team["can_manage_members"] is False
    assert {member["role"] for member in team["members"]} == {"owner", "editor"}

    activity = client.get(f"/api/v1/projects/{project_id}/activity?limit=10", headers=invitee_headers)
    assert activity.status_code == 200
    assert {event["action"] for event in activity.json()} >= {
        "project.create", "project.invitation.created", "project.invitation.accepted",
    }

    # Accepted tokens cannot be reused; unauthorized users cannot view activity.
    reused = client.post(
        "/api/v1/projects/invitations/accept",
        json={"token": invitation["token"]},
        headers=invitee_headers,
    )
    assert reused.status_code == 409
    outside_headers = _register(client, "outside@example.com")
    assert client.get(f"/api/v1/projects/{project_id}/activity", headers=outside_headers).status_code == 403


def test_member_role_update_removal_and_manager_permissions(client, pm_headers, dev_headers, dev_user):
    project_id = _create_project(client, pm_headers)
    added = client.post(
        f"/api/v1/projects/{project_id}/members?email={dev_user.email}&role=viewer",
        headers=pm_headers,
    )
    assert added.status_code == 201
    assert added.json()["role"] == "viewer"

    changed = client.patch(
        f"/api/v1/projects/{project_id}/members/{dev_user.id}",
        json={"role": "editor"},
        headers=pm_headers,
    )
    assert changed.status_code == 200
    assert changed.json()["role"] == "editor"

    forbidden = client.patch(
        f"/api/v1/projects/{project_id}/members/{dev_user.id}",
        json={"role": "viewer"},
        headers=dev_headers,
    )
    assert forbidden.status_code == 403
    assert client.delete(
        f"/api/v1/projects/{project_id}/members/{dev_user.id}", headers=pm_headers
    ).status_code == 204
    assert client.get(f"/api/v1/projects/{project_id}", headers=dev_headers).status_code == 403


def test_invitation_revoke_and_validation(client, pm_headers):
    project_id = _create_project(client, pm_headers)
    response = client.post(
        f"/api/v1/projects/{project_id}/invitations",
        json={"email": "pending@example.com", "role": "viewer"},
        headers=pm_headers,
    )
    assert response.status_code == 201
    invitation = response.json()
    revoked = client.delete(
        f"/api/v1/projects/{project_id}/invitations/{invitation['id']}", headers=pm_headers
    )
    assert revoked.status_code == 204
    team = client.get(f"/api/v1/projects/{project_id}/members", headers=pm_headers).json()
    assert team["invitations"][0]["status"] == "revoked"

    invalid_role = client.post(
        f"/api/v1/projects/{project_id}/invitations",
        json={"email": "another@example.com", "role": "owner"},
        headers=pm_headers,
    )
    assert invalid_role.status_code == 422
    assert client.get(f"/api/v1/projects/{project_id}/activity?limit=0", headers=pm_headers).status_code == 422


def test_project_admin_can_manage_members_but_not_admin_roles(client, pm_headers, dev_headers, dev_user):
    project_id = _create_project(client, pm_headers)
    promoted = client.post(
        f"/api/v1/projects/{project_id}/members?email={dev_user.email}&role=admin",
        headers=pm_headers,
    )
    assert promoted.status_code == 201

    team = client.get(f"/api/v1/projects/{project_id}/members", headers=dev_headers).json()
    assert team["current_role"] == "admin"
    assert team["can_manage_members"] is True
    assert team["can_manage_admins"] is False

    invited = client.post(
        f"/api/v1/projects/{project_id}/invitations",
        json={"email": "collaborator@example.com", "role": "editor"},
        headers=dev_headers,
    )
    assert invited.status_code == 201
    cannot_invite_admin = client.post(
        f"/api/v1/projects/{project_id}/invitations",
        json={"email": "another@example.com", "role": "admin"},
        headers=dev_headers,
    )
    assert cannot_invite_admin.status_code == 403


def test_expired_invitation_can_be_reissued(client, pm_headers, project_repo):
    from datetime import datetime, timedelta, timezone

    project_id = _create_project(client, pm_headers)
    invited = client.post(
        f"/api/v1/projects/{project_id}/invitations",
        json={"email": "expired@example.com", "role": "viewer"},
        headers=pm_headers,
    ).json()
    invitation = project_repo.get(invited["id"])
    invitation.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    project_repo.commit()

    team = client.get(f"/api/v1/projects/{project_id}/members", headers=pm_headers).json()
    assert team["invitations"][0]["status"] == "expired"
    expired = client.post(
        "/api/v1/projects/invitations/accept",
        json={"token": invited["token"]},
        headers=_register(client, "expired@example.com"),
    )
    assert expired.status_code == 409

    renewed = client.post(
        f"/api/v1/projects/{project_id}/invitations",
        json={"email": "expired@example.com", "role": "editor"},
        headers=pm_headers,
    )
    assert renewed.status_code == 201
    assert renewed.json()["status"] == "pending"
    assert renewed.json()["role"] == "editor"
    assert renewed.json()["token"] != invited["token"]
