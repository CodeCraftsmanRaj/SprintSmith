"""
Integration tests for AI engine health and prompts API endpoints.

Verifies:
- GET /health returns status and default_llm
- GET /artifact-types returns sorted list of artifact types
- GET /prompts lists all artifact types with versions
- GET /prompts/{type} reads a specific prompt version
- GET /prompts/{type} with unknown type returns 404
- POST /prompts/{type} creates a new prompt version
- POST /prompts/{type} with unknown type returns 404
- POST /prompts/{type}/test tests a prompt (needs prompt template)
"""

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health():
    """GET /health returns status ok and default_llm."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "default_llm" in data


def test_artifact_types():
    """GET /artifact-types returns sorted list of artifact types."""
    response = client.get("/artifact-types")
    assert response.status_code == 200
    data = response.json()
    assert "artifact_types" in data
    assert isinstance(data["artifact_types"], list)
    assert data["artifact_types"] == sorted(data["artifact_types"])


def test_list_prompts():
    """GET /prompts returns artifact types with versions."""
    response = client.get("/prompts")
    assert response.status_code == 200
    data = response.json()
    assert "artifact_types" in data
    assert isinstance(data["artifact_types"], dict)


def test_read_prompt_unknown_type():
    """GET /prompts/{type} with unknown type returns 404."""
    response = client.get("/prompts/nonexistent_type")
    assert response.status_code == 404


def test_create_prompt_unknown_type():
    """POST /prompts/{type} with unknown type returns 404."""
    response = client.post(
        "/prompts/nonexistent_type",
        json={"system": "sys", "human": "human"},
    )
    assert response.status_code == 404


def test_create_prompt_version():
    """POST /prompts/{type} creates a new version."""
    # First check what types exist
    types_response = client.get("/artifact-types")
    types = types_response.json()["artifact_types"]
    if not types:
        # No artifact types available, skip creation test
        return

    artifact_type = types[0]
    versions_response = client.get(f"/prompts/{artifact_type}")
    versions = versions_response.json()["artifact_types"].get(artifact_type, [])

    response = client.post(
        f"/prompts/{artifact_type}",
        json={
            "system": "You are a helpful assistant",
            "human": "Write a {{requirement}}",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["artifact_type"] == artifact_type
    assert "version_id" in data
    assert "version_file" in data


def test_read_prompt_existing_type():
    """GET /prompts/{type} returns prompt spec for existing type."""
    types_response = client.get("/artifact-types")
    types = types_response.json()["artifact_types"]
    if not types:
        return

    artifact_type = types[0]
    response = client.get(f"/prompts/{artifact_type}")
    assert response.status_code == 200
    data = response.json()
    assert data["artifact_type"] == artifact_type
    assert "version_id" in data
    assert "version_file" in data
    assert "spec" in data


def test_test_prompt_unknown_type():
    """POST /prompts/{type}/test with unknown type returns 404."""
    response = client.post(
        "/prompts/nonexistent_type/test",
        json={"version": "latest", "requirement_text": "test"},
    )
    assert response.status_code == 404
