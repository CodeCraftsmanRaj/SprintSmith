"""
Unit tests for app.config (Settings).

Verifies:
- _require() raises RuntimeError for missing/invalid vars
- validate() logic on Settings instances
- Settings attribute access
"""

import pytest

from app.config import Settings, _require


def test_require_raises_for_missing(monkeypatch):
    """_require() raises RuntimeError when env var is missing."""
    monkeypatch.delenv("NONEXISTENT_VAR_XYZ", raising=False)
    with pytest.raises(RuntimeError, match="Missing required env var"):
        _require("NONEXISTENT_VAR_XYZ")


def test_require_raises_for_change_me(monkeypatch):
    """_require() raises RuntimeError when env var is CHANGE_ME."""
    monkeypatch.setenv("TEST_VAR_CHANGE_ME", "CHANGE_ME")
    with pytest.raises(RuntimeError, match="Missing required env var"):
        _require("TEST_VAR_CHANGE_ME")


def test_require_returns_value(monkeypatch):
    """_require() returns the value when valid."""
    monkeypatch.setenv("TEST_VAR_VALUE", "my-value")
    assert _require("TEST_VAR_VALUE") == "my-value"


def test_validate_passes():
    """validate() passes when all required vars are present on the instance."""
    s = Settings()
    s.GOOGLE_API_KEY = "test-key"
    s.DATABASE_URL = "postgresql://localhost/test"
    s.GROQ_API_KEY = "test-key"
    s.DEFAULT_LLM = "groq-openai/gpt-oss-120b"
    s.FALLBACK_LLM = "gemini-3.6-flash"
    s.validate()  # should not raise


def test_validate_raises_missing_google_key():
    """validate() raises when GOOGLE_API_KEY is missing/empty."""
    s = Settings()
    s.GOOGLE_API_KEY = ""
    s.DATABASE_URL = "postgresql://localhost/test"
    s.GROQ_API_KEY = "test-key"
    s.DEFAULT_LLM = "groq-openai/gpt-oss-120b"
    s.FALLBACK_LLM = "gemini-3.6-flash"

    with pytest.raises(RuntimeError, match="GOOGLE_API_KEY"):
        s.validate()


def test_validate_raises_missing_database_url():
    """validate() raises when DATABASE_URL is missing."""
    s = Settings()
    s.GOOGLE_API_KEY = "test-key"
    s.DATABASE_URL = ""
    s.GROQ_API_KEY = "test-key"
    s.DEFAULT_LLM = "groq-openai/gpt-oss-120b"
    s.FALLBACK_LLM = "gemini-3.6-flash"

    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        s.validate()


def test_validate_raises_missing_groq_key():
    """validate() raises when DEFAULT_LLM is groq but GROQ_API_KEY missing."""
    s = Settings()
    s.GOOGLE_API_KEY = "test-key"
    s.DATABASE_URL = "postgresql://localhost/test"
    s.GROQ_API_KEY = ""
    s.DEFAULT_LLM = "groq-llama"
    s.FALLBACK_LLM = "gemini-3.6-flash"

    with pytest.raises(RuntimeError, match="GROQ_API_KEY"):
        s.validate()


def test_settings_attribute_access():
    """Settings instance attributes are accessible."""
    s = Settings()
    assert hasattr(s, "DEFAULT_LLM")
    assert hasattr(s, "FALLBACK_LLM")
    assert hasattr(s, "GOOGLE_API_KEY")
    assert hasattr(s, "DATABASE_URL")
    assert hasattr(s, "S3_EXPECTED_BUCKET_OWNER")
    assert hasattr(s, "DAILY_REQUEST_QUOTA")
    assert hasattr(s, "PORT")


def test_settings_is_singleton():
    """settings module-level instance is a Settings object."""
    from app.config import settings
    assert isinstance(settings, Settings)
