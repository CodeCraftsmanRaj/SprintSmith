from urllib.parse import parse_qs, urlsplit
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from app.services import grafana_dashboard
from app.services.grafana_dashboard import project_grafana_dashboard


@pytest.mark.parametrize(
    ("project_id", "root_url", "uid"),
    [("project_123", "https://grafana.example.com", "sprintsmith"),
     ("project-123", "https://grafana.example.com/grafana/", "dash_1")],
)
def test_builds_project_scoped_dashboard_url(project_id, root_url, uid):
    result = project_grafana_dashboard(project_id, root_url, uid)

    assert result.available is True
    parsed = urlsplit(result.dashboard_url)
    assert parsed.path.endswith(f"/d/{uid}/{uid}")
    assert parse_qs(parsed.query) == {"var-project_id": [project_id]}


@pytest.mark.parametrize("root_url", [None, "", "  "])
def test_missing_root_url_returns_actionable_unavailable_state(root_url):
    result = project_grafana_dashboard("project-1", root_url, "dashboard")

    assert result.available is False
    assert result.dashboard_url is None
    assert "GRAFANA_ROOT_URL" in result.message


@pytest.mark.parametrize(
    ("project_id", "root_url", "uid"),
    [
        ("project/1", "https://grafana.example.com", "dashboard"),
        ("project-1", "https://grafana.example.com", "bad uid"),
        ("project-1", "ftp://grafana.example.com", "dashboard"),
        ("project-1", "https://user:pass@grafana.example.com", "dashboard"),
        ("project-1", "https://grafana.example.com?orgId=1", "dashboard"),
        ("project-1", "https://grafana.example.com/#overview", "dashboard"),
        ("project-1", "https://grafana.example.com/%2e%2e/private", "dashboard"),
        ("project-1", "https://grafana.example.com\\evil", "dashboard"),
        ("project-1", "https://grafana.example.com:bad", "dashboard"),
    ],
)
def test_rejects_unsafe_or_invalid_dashboard_configuration(project_id, root_url, uid):
    result = project_grafana_dashboard(project_id, root_url, uid)

    assert result.available is False
    assert result.dashboard_url is None
    assert "settings are invalid" in result.message


def test_rejects_a_dashboard_url_that_fails_final_validation(monkeypatch):
    adapter = SimpleNamespace(
        validate_python=Mock(
            side_effect=[
                "https://grafana.example.com",
                "javascript://untrusted.example",
            ],
        ),
    )
    monkeypatch.setattr(grafana_dashboard, "_HTTP_URL", adapter)

    result = project_grafana_dashboard("project-1", "https://grafana.example.com", "dashboard")

    assert result.available is False
    assert result.dashboard_url is None
    assert "settings are invalid" in result.message
