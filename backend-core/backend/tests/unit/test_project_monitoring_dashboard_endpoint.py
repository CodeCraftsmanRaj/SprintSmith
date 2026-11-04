from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1 import projects
from app.core.exceptions import AuthorisationError, ResourceNotFoundError, ValidationError
from app.domain.schemas import ProjectUpdate


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


@pytest.mark.parametrize(
    ("endpoint", "method", "args", "error", "expected_status"),
    [
        (projects.update_project, "update", ("project-1", SimpleNamespace()), ResourceNotFoundError("missing"), 404),
        (projects.update_project, "update", ("project-1", SimpleNamespace()), AuthorisationError("denied"), 403),
        (projects.delete_project, "delete", ("project-1",), ResourceNotFoundError("missing"), 404),
        (projects.delete_project, "delete", ("project-1",), AuthorisationError("denied"), 403),
        (projects.add_member, "set_member", ("project-1", "member@example.test", "viewer"), ResourceNotFoundError("missing"), 404),
        (projects.add_member, "set_member", ("project-1", "member@example.test", "viewer"), AuthorisationError("denied"), 403),
        (projects.add_member, "set_member", ("project-1", "member@example.test", "viewer"), ValidationError("bad role"), 422),
    ],
)
def test_project_mutation_endpoints_map_service_errors(endpoint, method, args, error, expected_status):
    def fail(*_args):
        raise error

    service = SimpleNamespace(**{method: fail})
    payload = ProjectUpdate(name="Updated") if endpoint is projects.update_project else None
    call_args = (args[0], payload, service, SimpleNamespace()) if payload else (*args, None, service, SimpleNamespace())
    if endpoint is projects.delete_project:
        call_args = (*args, service, SimpleNamespace())
    if endpoint is projects.add_member:
        call_args = (*args, service, SimpleNamespace())

    with pytest.raises(HTTPException) as exc_info:
        endpoint(*call_args)

    assert exc_info.value.status_code == expected_status


@pytest.mark.parametrize(
    ("error", "expected_status"),
    [(ResourceNotFoundError("missing"), 404), (AuthorisationError("denied"), 403)],
)
def test_generation_history_maps_project_access_errors(error, expected_status):
    def fail(*_args):
        raise error

    service = SimpleNamespace(list_history=fail)

    with pytest.raises(HTTPException) as exc_info:
        projects.generation_history("project-1", service, SimpleNamespace())

    assert exc_info.value.status_code == expected_status
