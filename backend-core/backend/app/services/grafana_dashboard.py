"""Build safe project-scoped links to the provisioned Grafana dashboard."""

import re
from urllib.parse import unquote, urlencode, urlsplit, urlunsplit

from pydantic import AnyHttpUrl, TypeAdapter, ValidationError as PydanticValidationError

from app.domain.schemas.project import ProjectMonitoringDashboard

_SAFE_DASHBOARD_UID = re.compile(r"[A-Za-z0-9_-]{1,40}\Z")
_SAFE_PROJECT_ID = re.compile(r"[A-Za-z0-9_-]{1,80}\Z")
_HTTP_URL = TypeAdapter(AnyHttpUrl)


def project_grafana_dashboard(
    project_id: str,
    root_url: str | None,
    dashboard_uid: str,
) -> ProjectMonitoringDashboard:
    """Return a validated dashboard link, or an actionable unavailable state."""
    if not root_url or not root_url.strip():
        return ProjectMonitoringDashboard(
            available=False,
            message="Grafana is not configured. Set GRAFANA_ROOT_URL to enable dashboards.",
        )

    if not _SAFE_DASHBOARD_UID.fullmatch(dashboard_uid) or not _SAFE_PROJECT_ID.fullmatch(project_id):
        return _invalid_configuration()

    try:
        normalized_root = str(_HTTP_URL.validate_python(root_url.strip()))
        root = urlsplit(normalized_root)
        # Accessing .port also validates malformed port values.
        _ = root.port
        decoded_path = unquote(root.path)
        if (
            root.scheme not in {"http", "https"}
            or not root.hostname
            or root.username is not None
            or root.password is not None
            or root.query
            or root.fragment
            or any(segment in {".", ".."} for segment in decoded_path.split("/"))
            or "\\" in decoded_path
        ):
            return _invalid_configuration()

        base_path = root.path.rstrip("/")
        dashboard_path = f"{base_path}/d/{dashboard_uid}/{dashboard_uid}"
        query = urlencode({"var-project_id": project_id})
        dashboard_url = urlunsplit((root.scheme, root.netloc, dashboard_path, query, ""))
        dashboard_url = str(_HTTP_URL.validate_python(dashboard_url))
        validated = urlsplit(dashboard_url)
        if validated.scheme not in {"http", "https"} or not validated.hostname:
            return _invalid_configuration()
    except (PydanticValidationError, TypeError, ValueError):
        return _invalid_configuration()

    return ProjectMonitoringDashboard(available=True, dashboard_url=dashboard_url)


def _invalid_configuration() -> ProjectMonitoringDashboard:
    return ProjectMonitoringDashboard(
        available=False,
        message=(
            "Grafana dashboard settings are invalid. Check GRAFANA_ROOT_URL "
            "and GRAFANA_DASHBOARD_UID."
        ),
    )
