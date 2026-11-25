"""Authentication API tests. Accounts are provisioned by administrators."""


def test_public_registration_is_disabled(client):
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "new.user@example.com", "full_name": "New User", "password": "SecurePassword123!"},
    )
    assert response.status_code == 404


def test_admin_can_create_login_account(client, admin_headers):
    response = client.post(
        "/api/v1/admin/users",
        headers=admin_headers,
        json={"email": "new.user@example.com", "full_name": "New User", "password": "SecurePassword123!"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "new.user@example.com"
    assert data["full_name"] == "New User"
    assert "password" not in data
    assert "password_hash" not in data

    duplicate = client.post(
        "/api/v1/admin/users",
        headers=admin_headers,
        json={"email": "new.user@example.com", "full_name": "Duplicate", "password": "SecurePassword123!"},
    )
    assert duplicate.status_code == 409


def test_login_success_and_failures(client, admin_headers):
    # Account creation is restricted to administrators.
    client.post(
        "/api/v1/admin/users",
        headers=admin_headers,
        json={"email": "login.test@example.com", "full_name": "User", "password": "CorrectPassword1!"},
    )

    # Correct credentials -> 200 + token
    success = client.post(
        "/api/v1/auth/login",
        json={"email": "login.test@example.com", "password": "CorrectPassword1!"},
    )
    assert success.status_code == 200
    token_data = success.json()
    assert "access_token" in token_data
    assert token_data["token_type"].lower() == "bearer"

    # Wrong password -> 401
    wrong_pw = client.post(
        "/api/v1/auth/login",
        json={"email": "login.test@example.com", "password": "WrongPassword!"},
    )
    assert wrong_pw.status_code == 401

    # Unknown email -> 401
    unknown = client.post(
        "/api/v1/auth/login",
        json={"email": "nonexistent@example.com", "password": "CorrectPassword1!"},
    )
    assert unknown.status_code == 401


def test_auth_me_endpoint_security(client, admin_headers):
    # Create user through the supported admin flow and login.
    client.post(
        "/api/v1/admin/users",
        headers=admin_headers,
        json={"email": "me.user@example.com", "full_name": "Me User", "password": "Password123!"},
    )
    token = client.post(
        "/api/v1/auth/login",
        json={"email": "me.user@example.com", "password": "Password123!"},
    ).json()["access_token"]

    # Valid token -> 200
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "me.user@example.com"

    # Missing token -> 401
    no_token = client.get("/api/v1/auth/me")
    assert no_token.status_code == 401

    # Tampered token -> 401
    bad_token = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token[:-5]}zzzzz"})
    assert bad_token.status_code == 401
