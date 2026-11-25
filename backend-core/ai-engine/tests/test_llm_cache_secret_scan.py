from types import SimpleNamespace

from app.pipeline import llm_cache
from app.pipeline.secret_scan import raise_if_secrets_found, scan_for_secrets, scan_for_pii
from app.pipeline.observability import enforce_production_tracing_guard


def test_prompt_cache_key_changes_when_prompt_hash_changes():
    messages = [SimpleNamespace(content="same input")]
    assert llm_cache.cache_key("model", "prompt-v1", messages) != llm_cache.cache_key("model", "prompt-v2", messages)


def test_prompt_cache_roundtrip_and_disabled_mode(monkeypatch, tmp_path):
    monkeypatch.setenv("SPRINTSMITH_LLM_CACHE_PATH", str(tmp_path / "cache.sqlite3"))
    monkeypatch.delenv("SPRINTSMITH_LLM_CACHE", raising=False)
    llm_cache.put("key", "response")
    assert llm_cache.get("key") == "response"
    monkeypatch.setenv("SPRINTSMITH_LLM_CACHE", "disabled")
    assert llm_cache.get("key") is None


def test_secret_scanner_redacts_matches_and_raises():
    secret = "AKIA1234567890ABCDEF"
    findings = scan_for_secrets(f"credential={secret}")
    assert findings and secret not in findings[0]
    try:
        raise_if_secrets_found(f"credential={secret}")
    except ValueError as exc:
        assert secret not in str(exc)
    else:
        raise AssertionError("Expected secret scan to reject the input")


def test_pii_scanner_reports_categories_without_values():
    findings = scan_for_pii("Contact alex@example.com or call 555-123-4567")
    assert "email" in findings
    assert all("alex" not in finding for finding in findings)


def test_pii_policy_can_block_in_production(monkeypatch):
    monkeypatch.setenv("RTIA_ENV", "production")
    monkeypatch.delenv("SPRINTSMITH_PII_POLICY", raising=False)
    try:
        raise_if_secrets_found("Contact alex@example.com")
    except ValueError as exc:
        assert "alex@example.com" not in str(exc)
        assert "email" in str(exc)
    else:
        raise AssertionError("Production policy should block PII")


def test_production_tracing_guard_forces_disabled(monkeypatch):
    monkeypatch.setenv("RTIA_ENV", "production")
    monkeypatch.setenv("LANGSMITH_TRACING", "false")
    monkeypatch.setenv("LANGCHAIN_TRACING_V2", "false")
    enforce_production_tracing_guard()
    assert __import__("os").environ["LANGSMITH_TRACING"] == "false"


def test_production_tracing_guard_rejects_enabled_tracing(monkeypatch):
    monkeypatch.setenv("RTIA_ENV", "production")
    monkeypatch.setenv("LANGSMITH_TRACING", "true")
    try:
        enforce_production_tracing_guard()
    except RuntimeError as exc:
        assert "production" in str(exc)
    else:
        raise AssertionError("Enabled external traces must prevent production startup")
