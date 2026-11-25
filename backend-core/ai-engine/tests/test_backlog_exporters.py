from app.exporters.base import ExportTarget, make_exporter


def test_jira_export_dry_run_builds_adf_without_credentials(monkeypatch):
    monkeypatch.delenv("JIRA_BASE_URL", raising=False)
    monkeypatch.delenv("JIRA_EMAIL", raising=False)
    monkeypatch.delenv("JIRA_API_TOKEN", raising=False)
    result = make_exporter("jira").export(
        "# Story\n\nAs a user, I want access.",
        ExportTarget(backend="jira", jira_project_key="DEMO"),
        title="Story", dry_run=True,
    )
    assert result.success and result.dry_run
    assert result.payload["fields"]["project"]["key"] == "DEMO"
    assert result.payload["fields"]["description"]["type"] == "doc"


def test_github_update_dry_run_records_issue_id():
    result = make_exporter("github").update_issue(
        "42", "body", ExportTarget(backend="github", github_repo="owner/repo"),
        title="Revised story", dry_run=True,
    )
    assert result.success and result.dry_run
    assert result.payload["_meta"]["issue_number"] == "42"
