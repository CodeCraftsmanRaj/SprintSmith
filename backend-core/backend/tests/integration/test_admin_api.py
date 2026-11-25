"""Authorization and data shape for the platform administrator overview."""


def test_admin_overview_lists_users_projects_and_collaborators(
    client, admin_headers, pm_headers, dev_user
):
    project = client.post(
        "/api/v1/projects", json={"name": "Operations workspace"}, headers=pm_headers
    ).json()
    added = client.post(
        f"/api/v1/projects/{project['id']}/members?email={dev_user.email}&role=editor",
        headers=pm_headers,
    )
    assert added.status_code == 201

    response = client.get("/api/v1/admin/overview", headers=admin_headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"] == {"users": 3, "projects": 1, "collaborators": 1, "admins": 1}
    assert {row["email"] for row in payload["users"]} == {
        "admin@example.com", "pm@example.com", "dev@example.com",
    }
    assert payload["projects"][0]["name"] == "Operations workspace"
    assert payload["projects"][0]["owner_email"] == "pm@example.com"
    assert payload["projects"][0]["collaborators"] == 1
    assert all("password_hash" not in row for row in payload["users"])


def test_non_admin_is_denied_admin_overview(client, pm_headers):
    response = client.get("/api/v1/admin/overview", headers=pm_headers)
    assert response.status_code == 403
    assert response.json()["detail"] == "Administrator role required"
