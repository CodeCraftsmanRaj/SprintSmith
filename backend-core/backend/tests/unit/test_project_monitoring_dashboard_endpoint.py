from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1 import projects
from app.core.exceptions import AuthorisationError, ResourceNotFoundError


class StubProjectService:
    def __init__(self, result=None, error=None):
        self.result = result
        self.error = error

    def get_project_or_fail(self, project_id, user):
        if self.error:
            raise self.error
        return self.result


def test_monitoring_dashboard_endpoint_returns_project_dashboard(monkeypatch):
    monkeypatch.setattr(projects.settings, "grafana_root_url", "https://grafana.example.com")
    monkeypatch.setattr(projects.settings, "grafana_dashboard_uid", "sprintsmith")
    service = StubProjectService(SimpleNamespace(id="project-1"))

    result = projects.project_monitoring_dashboard("project-1", service, SimpleNamespace())

    assert result.available is True
    assert "var-project_id=project-1" in result.dashboard_url


@pytest.mark.parametrize(
    ("error", "expected_status"),
    [(ResourceNotFoundError("missing"), 404), (AuthorisationError("denied"), 403)],
)
def test_monitoring_dashboard_endpoint_maps_project_access_errors(error, expected_status):
    service = StubProjectService(error=error)

    with pytest.raises(HTTPException) as exc_info:
        projects.project_monitoring_dashboard("project-1", service, SimpleNamespace())

    assert exc_info.value.status_code == expected_status
