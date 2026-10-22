import asyncio

import httpx
from app.main import app


def request(method: str, path: str, **kwargs) -> httpx.Response:
    async def send() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.request(method, path, **kwargs)

    return asyncio.run(send())


def test_health_contract() -> None:
    response = request("GET", "/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_search_starts_with_hybrid_contract(monkeypatch) -> None:
    monkeypatch.setattr("app.main.fetch_all", lambda *args: [])
    response = request("POST", "/v1/search", json={"query": "retention policy"})

    assert response.status_code == 200
    assert response.json() == {
        "query": "retention policy",
        "mode": "lexical-ready-hybrid",
        "results": [],
    }


def test_metrics_endpoint_exposes_prometheus_format() -> None:
    response = request("GET", "/metrics")

    assert response.status_code == 200
    assert "sprintsmith_http_requests_total" in response.text