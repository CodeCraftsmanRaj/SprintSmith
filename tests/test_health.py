from app.main import app
from fastapi.testclient import TestClient


def test_health_contract() -> None:
    response = TestClient(app).get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_search_starts_with_hybrid_contract() -> None:
    response = TestClient(app).post("/v1/search", json={"query": "retention policy"})

    assert response.status_code == 200
    assert response.json() == {"query": "retention policy", "mode": "hybrid", "results": []}


def test_metrics_endpoint_exposes_prometheus_format() -> None:
    response = TestClient(app).get("/metrics")

    assert response.status_code == 200
    assert "sprintsmith_http_requests_total" in response.text