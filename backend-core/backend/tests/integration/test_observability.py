import httpx
import pytest

from app.api.v1 import observability


class FakeAsyncClient:
    def __init__(self, responses=None, error=None, **kwargs):
        self.responses = list(responses or [])
        self.error = error
        self.calls = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def get(self, path, params):
        self.calls.append((path, dict(params)))
        if self.error:
            raise self.error
        return self.responses.pop(0)


def _response(payload, status=200):
    return httpx.Response(
        status,
        json=payload,
        request=httpx.Request("GET", "https://langfuse.example/api/public/v2/observations"),
    )


def _enable_langfuse(monkeypatch):
    monkeypatch.setattr(observability.settings, "langfuse_enabled", True)
    monkeypatch.setattr(observability.settings, "langfuse_public_key", "pk-test")
    monkeypatch.setattr(observability.settings, "langfuse_secret_key", "sk-test")


def test_langfuse_observations_requires_admin(client, dev_headers):
    response = client.get("/api/v1/observability/langfuse", headers=dev_headers)

    assert response.status_code == 403
    assert response.json()["detail"] == "Administrator role required"


def test_langfuse_observations_returns_unconfigured_state(client, admin_headers, monkeypatch):
    monkeypatch.setattr(observability.settings, "langfuse_enabled", False)
    monkeypatch.setattr(observability.settings, "langfuse_base_url", "https://langfuse.example")

    response = client.get("/api/v1/observability/langfuse?days=30", headers=admin_headers)

    assert response.status_code == 200
    assert response.json() == {
        "configured": False,
        "langfuse_url": "https://langfuse.example",
        "days": 30,
        "observations": [],
        "truncated": False,
    }


def test_langfuse_observations_rejects_invalid_range(client, admin_headers):
    assert client.get("/api/v1/observability/langfuse?days=0", headers=admin_headers).status_code == 422
    assert client.get("/api/v1/observability/langfuse?days=31", headers=admin_headers).status_code == 422


def test_langfuse_observations_paginates_and_returns_rows(client, admin_headers, monkeypatch):
    _enable_langfuse(monkeypatch)
    fake = FakeAsyncClient(responses=[
        _response({"data": [{"id": "one"}], "meta": {"cursor": "next-page"}}),
        _response({"data": [{"id": "two"}], "meta": {}}),
    ])
    monkeypatch.setattr(observability.httpx, "AsyncClient", lambda **kwargs: fake)

    response = client.get("/api/v1/observability/langfuse?days=3", headers=admin_headers)

    assert response.status_code == 200
    assert response.json()["observations"] == [{"id": "one"}, {"id": "two"}]
    assert response.json()["truncated"] is False
    assert fake.calls[0][1]["limit"] == observability._PAGE_SIZE
    assert "cursor" not in fake.calls[0][1]
    assert fake.calls[1][1]["cursor"] == "next-page"


def test_langfuse_observations_marks_max_page_result_truncated(client, admin_headers, monkeypatch):
    _enable_langfuse(monkeypatch)
    fake = FakeAsyncClient(responses=[
        _response({"data": [{"id": str(page)}], "meta": {"cursor": f"page-{page + 1}"}})
        for page in range(observability._MAX_PAGES)
    ])
    monkeypatch.setattr(observability.httpx, "AsyncClient", lambda **kwargs: fake)

    response = client.get("/api/v1/observability/langfuse", headers=admin_headers)

    assert response.status_code == 200
    assert len(response.json()["observations"]) == observability._MAX_PAGES
    assert response.json()["truncated"] is True


@pytest.mark.parametrize(
    "status, expected_detail",
    [
        (401, "Langfuse rejected the configured API keys"),
        (403, "Langfuse API key needs read access to traces"),
        (500, "Langfuse API returned HTTP 500"),
    ],
)
def test_langfuse_observations_maps_langfuse_http_errors(
    client, admin_headers, monkeypatch, status, expected_detail
):
    _enable_langfuse(monkeypatch)
    fake = FakeAsyncClient(responses=[_response({"detail": "failure"}, status=status)])
    monkeypatch.setattr(observability.httpx, "AsyncClient", lambda **kwargs: fake)

    response = client.get("/api/v1/observability/langfuse", headers=admin_headers)

    assert response.status_code == 502
    assert response.json()["detail"] == expected_detail


@pytest.mark.parametrize("error_type", [httpx.TimeoutException, httpx.ConnectError])
def test_langfuse_observations_maps_connection_errors(
    client, admin_headers, monkeypatch, error_type
):
    _enable_langfuse(monkeypatch)
    fake = FakeAsyncClient(error=error_type("Langfuse unavailable"))
    monkeypatch.setattr(observability.httpx, "AsyncClient", lambda **kwargs: fake)

    response = client.get("/api/v1/observability/langfuse", headers=admin_headers)

    assert response.status_code == 502
    assert response.json()["detail"] == "Could not reach the Langfuse API"
