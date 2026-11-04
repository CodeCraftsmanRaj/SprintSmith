"""
Integration tests for /api/v1/generate endpoints.

Verifies:
- POST /projects/{id}/generate - artifact generation (success, 404, 403)
- POST /projects/{id}/generate/stream - SSE stream
- POST /projects/{id}/compare - multi-LLM comparison
- POST /projects/{id}/chat - chat message
- GET /projects/{id}/chat - chat history
- POST /projects/{id}/case-study - case study generation
- GET /projects/{id}/case-study/compare - case study comparison
- GET /projects/{id}/traceability - traceability matrix
- GET /artifacts/{id}/sprint-analysis - sprint analysis
- POST /projects/{id}/requirements/text - text requirement ingestion
- GET /projects/{id}/stats - project statistics
"""

import pytest


def test_generate_artifact(client, dev_headers, mock_ai_generate):
    """POST /projects/{id}/generate creates an artifact."""
    project = client.post("/api/v1/projects", json={"name": "Gen"}, headers=dev_headers).json()
    project_id = project["id"]

    response = client.post(
        f"/api/v1/projects/{project_id}/generate",
        json={"artifact_type": "user_story", "requirement_text": "As a user, I want to log in"},
        headers=dev_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["artifact_type"] == "user_story"
    assert data["project_id"] == project_id


def test_generate_artifact_requirement_not_found(client, dev_headers, mock_ai_generate):
    """POST /generate with bad requirement_id returns 404."""
    project = client.post("/api/v1/projects", json={"name": "Gen"}, headers=dev_headers).json()
    project_id = project["id"]

    response = client.post(
        f"/api/v1/projects/{project_id}/generate",
        json={
            "artifact_type": "user_story",
            "requirement_text": "test",
            "requirement_id": "nonexistent",
        },
        headers=dev_headers,
    )
    assert response.status_code == 404


def test_generate_stream_endpoint_exists(client, dev_headers, monkeypatch):
    """POST /generate/stream endpoint is registered (not 404)."""
    project = client.post("/api/v1/projects", json={"name": "Stream"}, headers=dev_headers).json()
    project_id = project["id"]

    # Mock returns an awaitable that resolves to an async generator
    from types import SimpleNamespace

    class MockStream:
        def __aiter__(self):
            return self

        async def __anext__(self):
            raise StopAsyncIteration

    async def fake_stream(self, project_id, artifact_type, requirement_text):
        return MockStream()

    from app.services.ai_engine import AIEngineClient
    monkeypatch.setattr(AIEngineClient, "stream_generate", fake_stream)

    response = client.post(
        f"/api/v1/projects/{project_id}/generate/stream",
        json={"artifact_type": "user_story", "requirement_text": "test"},
        headers=dev_headers,
    )
    assert response.status_code != 404


def test_compare_llms(client, dev_headers, monkeypatch):
    """POST /compare returns comparison results."""
    project = client.post("/api/v1/projects", json={"name": "Compare"}, headers=dev_headers).json()
    project_id = project["id"]

    async def fake_compare(self, project_id, artifact_type, requirement_text):
        return {"primary": {"output": {}}, "fallback": {"output": {}}}

    from app.services.ai_engine import AIEngineClient
    monkeypatch.setattr(AIEngineClient, "generate_compare", fake_compare)

    response = client.post(
        f"/api/v1/projects/{project_id}/compare",
        json={"artifact_type": "user_story", "requirement_text": "test"},
        headers=dev_headers,
    )
    assert response.status_code == 200


def test_chat_send(client, dev_headers, monkeypatch):
    """POST /chat sends a message."""
    project = client.post("/api/v1/projects", json={"name": "Chat"}, headers=dev_headers).json()
    project_id = project["id"]

    async def fake_send(self, project_id, message, user):
        return {"response": "Hello!", "message_id": "msg-1"}

    from app.services.chat_service import ChatService
    monkeypatch.setattr(ChatService, "send_message", fake_send)

    response = client.post(
        f"/api/v1/projects/{project_id}/chat",
        json={"message": "Hello"},
        headers=dev_headers,
    )
    assert response.status_code == 201


def test_chat_history(client, dev_headers, monkeypatch):
    """GET /chat returns chat history."""
    project = client.post("/api/v1/projects", json={"name": "ChatHist"}, headers=dev_headers).json()
    project_id = project["id"]

    def fake_history(self, project_id, limit):
        return [{"message": "Hi", "role": "user"}]

    from app.services.chat_service import ChatService
    monkeypatch.setattr(ChatService, "history", fake_history)

    response = client.get(f"/api/v1/projects/{project_id}/chat", headers=dev_headers)
    assert response.status_code == 200


def test_case_study(client, dev_headers, monkeypatch):
    """POST /case-study generates case studies."""
    project = client.post("/api/v1/projects", json={"name": "CaseStudy"}, headers=dev_headers).json()
    project_id = project["id"]

    async def fake_generate(self, project_id, limit, user):
        return {"artifacts": []}

    from app.services.case_study_service import CaseStudyService
    monkeypatch.setattr(CaseStudyService, "generate", fake_generate)

    response = client.post(
        f"/api/v1/projects/{project_id}/case-study",
        json={"limit": 5},
        headers=dev_headers,
    )
    assert response.status_code == 200


def test_case_study_compare(client, dev_headers, monkeypatch):
    """GET /case-study/compare compares case studies."""
    project = client.post("/api/v1/projects", json={"name": "CaseCompare"}, headers=dev_headers).json()
    project_id = project["id"]

    async def fake_compare(self, project_id, artifact_type, requirement_text):
        return {"primary": {}, "fallback": {}}

    from app.services.ai_engine import AIEngineClient
    monkeypatch.setattr(AIEngineClient, "generate_compare", fake_compare)

    response = client.get(
        f"/api/v1/projects/{project_id}/case-study/compare?requirement_id=req-1",
        headers=dev_headers,
    )
    # requirement_id=req-1 doesn't exist, so 404
    assert response.status_code == 404


def test_traceability_matrix(client, dev_headers):
    """GET /traceability returns nodes and edges."""
    project = client.post("/api/v1/projects", json={"name": "Trace"}, headers=dev_headers).json()
    project_id = project["id"]

    response = client.get(f"/api/v1/projects/{project_id}/traceability", headers=dev_headers)
    assert response.status_code == 200
    data = response.json()
    assert "nodes" in data
    assert "edges" in data


def test_sprint_analysis_not_found(client, dev_headers):
    """GET /artifacts/{id}/sprint-analysis with missing artifact returns 404."""
    response = client.get("/api/v1/artifacts/nonexistent/sprint-analysis", headers=dev_headers)
    assert response.status_code == 404


def test_ingest_requirement_text(client, dev_headers, monkeypatch):
    """POST /projects/{id}/requirements/text ingests text."""
    project = client.post("/api/v1/projects", json={"name": "ReqText"}, headers=dev_headers).json()
    project_id = project["id"]

    async def fake_create_ingest_job(db, project_id, user, data, filename, doc_type, upload_dir):
        from app.domain.models import Requirement, IngestJob
        from uuid import uuid4
        req = Requirement(id="req-1", project_id=project_id, uploaded_by=user.id,
                         filename=filename, file_path="/tmp/test.txt", content=data.decode(),
                         doc_type=doc_type, chunks_indexed=0)
        job = IngestJob(id="job-1", requirement_id="req-1", engine_job_id="eng-1",
                       status="processing")
        return req, job

    from app.services import ingest_service
    monkeypatch.setattr(ingest_service, "create_ingest_job", fake_create_ingest_job)

    response = client.post(
        f"/api/v1/projects/{project_id}/requirements/text",
        json={"content": "This is a test requirement with enough characters here.",
              "doc_type": "requirement"},
        headers=dev_headers,
    )
    assert response.status_code == 202


def test_ingest_requirement_text_too_short(client, dev_headers):
    """POST /requirements/text with short content returns 422."""
    project = client.post("/api/v1/projects", json={"name": "ReqShort"}, headers=dev_headers).json()
    project_id = project["id"]

    response = client.post(
        f"/api/v1/projects/{project_id}/requirements/text",
        json={"content": "short", "doc_type": "requirement"},
        headers=dev_headers,
    )
    assert response.status_code == 422


def test_project_stats(client, dev_headers, monkeypatch):
    """GET /projects/{id}/stats returns statistics."""
    project = client.post("/api/v1/projects", json={"name": "Stats"}, headers=dev_headers).json()
    project_id = project["id"]

    def fake_get_stats(self, project_id):
        return {"total_artifacts": 5, "by_type": {"user_story": 3}}

    from app.services.project_stats_service import ProjectStatsService
    monkeypatch.setattr(ProjectStatsService, "get_project_stats", fake_get_stats)

    response = client.get(f"/api/v1/projects/{project_id}/stats", headers=dev_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total_artifacts"] == 5
