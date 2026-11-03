import time
from collections import deque

from app import main as main_module


def test_auth_rate_limit_returns_retry_after_header(client):
    responses = [
        client.post(
            "/api/v1/auth/login",
            json={"email": "missing@example.com", "password": "invalid"},
        )
        for _ in range(11)
    ]

    assert all(response.status_code == 401 for response in responses[:10])
    limited = responses[-1]
    assert limited.status_code == 429
    assert limited.json() == {"detail": "Rate limit exceeded"}
    assert int(limited.headers["Retry-After"]) > 0


def test_auth_rate_limit_expires_old_events(client):
    now = time.monotonic()
    main_module._rate_windows[("auth", "testclient")] = deque([now - 61, now - 30])
    main_module._rate_windows[("auth", "expired-client")] = deque([now - 61])

    response = client.post(
        "/api/v1/auth/login",
        json={"email": "missing@example.com", "password": "invalid"},
    )

    assert response.status_code == 401
    events = main_module._rate_windows[("auth", "testclient")]
    assert len(events) == 2
    assert events[0] == now - 30
    assert events[1] >= now
    assert ("auth", "expired-client") not in main_module._rate_windows


def test_auth_rate_limit_clears_oversized_bucket_map(client):
    now = time.monotonic()
    main_module._rate_windows.update({
        ("stale", str(index)): deque([now - 1]) for index in range(10_001)
    })

    response = client.post(
        "/api/v1/auth/login",
        json={"email": "missing@example.com", "password": "invalid"},
    )

    assert response.status_code == 401
    assert set(main_module._rate_windows) == {("auth", "testclient")}


def test_generation_route_uses_its_own_rate_limit_bucket(client, dev_headers):
    response = client.post(
        "/api/v1/projects/missing-project/generate",
        json={"artifact_type": "user_story", "requirement_text": "As a user"},
        headers=dev_headers,
    )

    assert response.status_code == 404
    assert ("generate", "testclient") in main_module._rate_windows
