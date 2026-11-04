"""
Unit tests for artifact_export.py service.

Verifies all export formats:
- JSON, Markdown, CSV, YAML
- Gherkin (only for acceptance_criteria)
- Unknown format returns None
- User story CSV with stories
- Sprint plan CSV
- Test case CSV
- Acceptance criteria CSV and Gherkin
"""

import csv
import io
import json

import yaml

from app.domain.models import Artifact
from app.services.artifact_export import (
    _download,
    _export_csv,
    _export_gherkin,
    _export_json,
    _export_markdown,
    _export_yaml,
    render_artifact_export,
    _write_csv,
)


def _body_text(response):
    return response.body.decode() if isinstance(response.body, bytes) else str(response.body)


def _make_artifact(artifact_type="user_story", artifact_id="art-1", project_id="proj-1",
                   title="Test Artifact", version=1, content=None):
    if content is None:
        content = {"key": "value", "number": 42}
    return Artifact(
        id=artifact_id, project_id=project_id, created_by="user-1",
        artifact_type=artifact_type, title=title, content=content, version=version,
    )


def test_export_json():
    artifact = _make_artifact()
    response = _export_json(artifact)
    assert response.status_code == 200
    assert "application/json" in response.media_type
    data = json.loads(response.body)
    assert data["id"] == "art-1"
    assert data["title"] == "Test Artifact"


def test_export_markdown():
    artifact = _make_artifact()
    response = _export_markdown(artifact)
    assert response.status_code == 200
    assert "text/markdown" in response.media_type
    assert "# Test Artifact" in _body_text(response)


def test_export_csv_user_story():
    content = {
        "stories": [
            {"id": "US-1", "title": "Login", "story": "As a user", "priority": "High",
             "category": "auth", "story_points": 5, "sprint_candidate": "Sprint 1"},
        ]
    }
    artifact = _make_artifact(content=content)
    response = _export_csv(artifact)
    text = _body_text(response)
    assert "Issue ID" in text
    assert "US-1" in text


def test_export_csv_sprint_plan():
    content = {
        "items": [
            {"sprint": "Sprint 1", "story_title": "Login", "story_points": 5,
             "effort_estimate_hours": 10, "dependencies": ["API"]},
        ]
    }
    artifact = _make_artifact(artifact_type="sprint_plan", content=content)
    response = _export_csv(artifact)
    text = _body_text(response)
    assert "Sprint" in text
    assert "Sprint 1" in text


def test_export_csv_test_case():
    content = {
        "cases": [
            {"id": "TC-1", "title": "Login test", "category": "auth",
             "steps": ["Open app", "Enter credentials"], "expected_result": "Logged in",
             "traceability": "REQ-1"},
        ]
    }
    artifact = _make_artifact(artifact_type="test_case", content=content)
    response = _export_csv(artifact)
    text = _body_text(response)
    assert "ID" in text
    assert "TC-1" in text


def test_export_csv_acceptance_criteria():
    content = {
        "user_story_title": "Login story",
        "criteria": [
            {"title": "Valid credentials", "given": "User is on login page",
             "when": "User enters valid credentials", "then": "User is logged in",
             "case_type": "positive"},
        ],
    }
    artifact = _make_artifact(artifact_type="acceptance_criteria", content=content)
    response = _export_csv(artifact)
    text = _body_text(response)
    assert "User Story" in text


def test_export_csv_default():
    artifact = _make_artifact(artifact_type="other_type")
    response = _export_csv(artifact)
    text = _body_text(response)
    assert "id" in text
    assert "art-1" in text


def test_export_yaml():
    artifact = _make_artifact()
    response = _export_yaml(artifact)
    assert response.status_code == 200
    data = yaml.safe_load(response.body)
    assert data["id"] == "art-1"


def test_export_gherkin_acceptance_criteria():
    content = {
        "criteria": [
            {"title": "Valid login", "given": "User is on login page",
             "when": "User enters valid credentials", "then": "User is logged in",
             "case_type": "positive"},
        ],
    }
    artifact = _make_artifact(artifact_type="acceptance_criteria", content=content)
    response = _export_gherkin(artifact)
    assert response.status_code == 200
    text = _body_text(response)
    assert "Feature:" in text
    assert "Scenario: Valid login" in text
    assert "Given User is on login page" in text


def test_export_gherkin_not_acceptance_criteria():
    artifact = _make_artifact(artifact_type="user_story")
    response = _export_gherkin(artifact)
    # Gherkin export only for acceptance_criteria, but the function itself doesn't check
    # It will try to iterate criteria which is empty
    assert response.status_code == 200


def test_render_artifact_export_json():
    artifact = _make_artifact()
    response = render_artifact_export(artifact, "json")
    assert response is not None
    assert "application/json" in response.media_type


def test_render_artifact_export_markdown():
    artifact = _make_artifact()
    response = render_artifact_export(artifact, "markdown")
    assert response is not None


def test_render_artifact_export_md_alias():
    artifact = _make_artifact()
    response = render_artifact_export(artifact, "md")
    assert response is not None


def test_render_artifact_export_csv():
    artifact = _make_artifact()
    response = render_artifact_export(artifact, "csv")
    assert response is not None


def test_render_artifact_export_yaml():
    artifact = _make_artifact()
    response = render_artifact_export(artifact, "yaml")
    assert response is not None


def test_render_artifact_export_yml_alias():
    artifact = _make_artifact()
    response = render_artifact_export(artifact, "yml")
    assert response is not None


def test_render_artifact_export_gherkin_ac():
    content = {
        "criteria": [
            {"title": "Valid", "given": "Given step", "when": "When step",
             "then": "Then step", "case_type": "positive"},
        ],
    }
    artifact = _make_artifact(artifact_type="acceptance_criteria", content=content)
    response = render_artifact_export(artifact, "gherkin")
    assert response is not None


def test_render_artifact_export_gherkin_not_ac():
    artifact = _make_artifact(artifact_type="user_story")
    response = render_artifact_export(artifact, "gherkin")
    assert response is None


def test_render_artifact_export_unknown_format():
    artifact = _make_artifact()
    response = render_artifact_export(artifact, "xml")
    assert response is None


def test_download_helper():
    artifact = _make_artifact()
    response = _download(artifact, "txt", "body text", "text/plain")
    assert response.status_code == 200
    assert response.body == b"body text"
    assert 'filename="user_story-art-1.txt"' in response.headers["content-disposition"]
