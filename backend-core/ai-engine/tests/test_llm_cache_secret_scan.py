from types import SimpleNamespace

from app.pipeline import llm_cache
from app.pipeline.secret_scan import raise_if_secrets_found, scan_for_secrets, scan_for_pii


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
