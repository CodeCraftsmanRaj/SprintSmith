from contextlib import contextmanager
from types import SimpleNamespace
from uuid import UUID, uuid4

import app.main as main
import pytest
from fastapi.testclient import TestClient

TENANT = UUID("00000000-0000-0000-0000-000000000001")


@pytest.fixture
def client():
    return TestClient(main.app)


def test_ready_returns_503_when_database_is_unavailable(client, monkeypatch):
    monkeypatch.setattr(main, "database_is_ready", lambda: False)
    response = client.get("/ready")
    assert response.status_code == 503
    assert response.json()["detail"] == "database is not ready"


def test_search_maps_database_rows_to_response_models(client, monkeypatch):
    document_id, chunk_id = uuid4(), uuid4()
    monkeypatch.setattr(
        main,
        "fetch_all",
        lambda *_: [
            {
                "document_id": document_id,
                "chunk_id": chunk_id,
                "text": "Transfer a payment",
                "score": "0.75",
                "citation": "payments.pdf:chunk-2",
            }
        ],
    )
    response = client.post("/v1/search", json={"query": "payment transfer", "top_k": 4})
    assert response.status_code == 200
    assert response.json() == {
        "query": "payment transfer",
        "mode": "lexical-ready-hybrid",
        "results": [
            {
                "document_id": str(document_id),
                "chunk_id": str(chunk_id),
                "text": "Transfer a payment",
                "score": 0.75,
                "citation": "payments.pdf:chunk-2",
            }
        ],
    }


def test_search_returns_empty_results(client, monkeypatch):
    monkeypatch.setattr(main, "fetch_all", lambda *_: [])
    response = client.post("/v1/search", json={"query": "nothing here"})
    assert response.status_code == 200
    assert response.json()["results"] == []


def test_upload_rejects_unknown_tenant_and_empty_file(client, monkeypatch):
    response = client.post(f"/v1/tenants/{uuid4()}/documents", files={"file": ("a.txt", b"x")})
    assert response.status_code == 404
    monkeypatch.setattr(main, "get_settings", lambda: SimpleNamespace(upload_dir="/tmp"))
    response = client.post(f"/v1/tenants/{TENANT}/documents", files={"file": ("empty.txt", b"")})
    assert response.status_code == 400


def test_upload_inserts_document_and_queued_job(client, monkeypatch, tmp_path):
    calls = []

    class Connection:
        def execute(self, query, params):
            calls.append((query, params))
            if query.startswith("SELECT"):
                return SimpleNamespace(fetchone=lambda: None)

    @contextmanager
    def fake_connection():
        yield Connection()

    monkeypatch.setattr(main, "get_settings", lambda: SimpleNamespace(upload_dir=str(tmp_path)))
    monkeypatch.setattr(main, "connection", fake_connection)
    response = client.post(
        f"/v1/tenants/{TENANT}/documents", files={"file": ("../spec.txt", b"hello", "text/plain")}
    )
    assert response.status_code == 202
    payload = response.json()
    assert payload["status"] == "queued"
    assert payload["attempts"] == 0
    assert len(calls) == 3
    assert (
        tmp_path / f"{__import__('hashlib').sha256(b'hello').hexdigest()}-spec.txt"
    ).read_bytes() == b"hello"


@pytest.mark.parametrize("has_job", [True, False])
def test_upload_deduplicates_existing_document(client, monkeypatch, tmp_path, has_job):
    document_id, job_id = uuid4(), uuid4()

    class Connection:
        def __init__(self):
            self.select_count = 0

        def execute(self, query, params):
            if query.startswith("SELECT"):
                self.select_count += 1
                if self.select_count == 1:
                    return SimpleNamespace(fetchone=lambda: (document_id,))
                return SimpleNamespace(
                    fetchone=lambda: (job_id, "processing", 2, None) if has_job else None
                )

    fake = Connection()

    @contextmanager
    def fake_connection():
        yield fake

    monkeypatch.setattr(main, "get_settings", lambda: SimpleNamespace(upload_dir=str(tmp_path)))
    monkeypatch.setattr(main, "connection", fake_connection)
    response = client.post(
        f"/v1/tenants/{TENANT}/documents", files={"file": ("spec.txt", b"duplicate")}
    )
    assert response.status_code == 202
    if has_job:
        assert response.json() == {
            "id": str(job_id),
            "document_id": str(document_id),
            "status": "processing",
            "attempts": 2,
            "error": None,
        }
    else:
        assert response.json()["document_id"] == str(document_id)
        assert response.json()["status"] == "queued"


def test_document_listing_and_lookup(client, monkeypatch):
    document_id = uuid4()
    row = {
        "id": document_id,
        "tenant_id": TENANT,
        "filename": "spec.pdf",
        "content_type": "application/pdf",
        "status": "ready",
        "checksum": "abc",
    }
    monkeypatch.setattr(main, "fetch_all", lambda *_: [row])
    listing = client.get(f"/v1/tenants/{TENANT}/documents")
    assert listing.status_code == 200 and listing.json()[0]["filename"] == "spec.pdf"
    found = client.get(f"/v1/tenants/{TENANT}/documents/{document_id}")
    assert found.status_code == 200 and found.json()["id"] == str(document_id)
    monkeypatch.setattr(main, "fetch_all", lambda *_: [])
    missing = client.get(f"/v1/tenants/{TENANT}/documents/{document_id}")
    assert missing.status_code == 404


@pytest.mark.parametrize("rowcount,expected", [(1, 204), (0, 404)])
def test_delete_document_handles_deleted_and_missing_rows(client, monkeypatch, rowcount, expected):
    class Connection:
        def execute(self, *_):
            return SimpleNamespace(rowcount=rowcount)

    @contextmanager
    def fake_connection():
        yield Connection()

    monkeypatch.setattr(main, "connection", fake_connection)
    response = client.delete(f"/v1/tenants/{TENANT}/documents/{uuid4()}")
    assert response.status_code == expected


def test_job_listing_and_lookup(client, monkeypatch):
    job_id, document_id = uuid4(), uuid4()
    row = {
        "id": job_id,
        "document_id": document_id,
        "status": "failed",
        "attempts": 3,
        "error": "bad file",
    }
    monkeypatch.setattr(main, "fetch_all", lambda *_: [row])
    assert client.get(f"/v1/tenants/{TENANT}/jobs").json()[0]["attempts"] == 3
    assert client.get(f"/v1/tenants/{TENANT}/jobs/{job_id}").json()["error"] == "bad file"
    monkeypatch.setattr(main, "fetch_all", lambda *_: [])
    assert client.get(f"/v1/tenants/{TENANT}/jobs/{job_id}").status_code == 404


def test_graph_endpoints_return_entities_and_relationships(client, monkeypatch):
    entity_id = uuid4()
    monkeypatch.setattr(
        main,
        "fetch_all",
        lambda *_: [
            {
                "id": entity_id,
                "name": "Payments",
                "entity_type": "system",
                "properties": {"tier": 1},
            }
        ],
    )
    entities = client.get(f"/v1/tenants/{TENANT}/graph/entities")
    assert entities.status_code == 200 and entities.json()[0]["name"] == "Payments"
    monkeypatch.setattr(
        main,
        "fetch_all",
        lambda *_: [
            {
                "id": uuid4(),
                "subject": "Payments",
                "predicate": "uses",
                "object": "Ledger",
                "confidence": 0.9,
                "source_chunk_id": uuid4(),
            }
        ],
    )
    relationships = client.get(f"/v1/tenants/{TENANT}/graph/relationships")
    assert relationships.status_code == 200 and relationships.json()[0]["predicate"] == "uses"


def test_lifespan_and_run_entrypoint(monkeypatch):
    import asyncio

    import uvicorn

    monkeypatch.setattr(
        main,
        "get_settings",
        lambda: SimpleNamespace(
            log_level="INFO", environment="test", version="test", app_name="test"
        ),
    )

    async def exercise_lifespan():
        async with main.lifespan(main.app):
            return

    asyncio.run(exercise_lifespan())
    calls = []
    monkeypatch.setattr(uvicorn, "run", lambda *args, **kwargs: calls.append((args, kwargs)))
    main.run()
    assert calls == [(("app.main:app",), {"host": "0.0.0.0", "port": 8000, "reload": False})]


def test_middleware_marks_unknown_routes_and_preserves_request_id(client):
    response = client.get("/not-a-route", headers={"x-request-id": "trace-123"})
    assert response.status_code == 404
    assert response.headers["x-request-id"] == "trace-123"
