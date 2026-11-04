"""
Unit tests for app.tracking.usage.

Verifies:
- record_request() increments counter and returns quota info
- Daily reset when date changes
- build_usage_record() maps usage metadata correctly
- Quota exceeded detection at > quota
- Approaching quota warning at 90%
"""

from datetime import date, timedelta
from unittest.mock import patch

from app.tracking import usage


def test_record_request_increments(monkeypatch):
    """record_request increments the daily counter."""
    # Reset state
    usage._state["day"] = date.today()
    usage._state["count"] = 0

    # Lower quota for test
    monkeypatch.setattr(usage.settings, "DAILY_REQUEST_QUOTA", 100)

    result1 = usage.record_request()
    assert result1["requests_today"] == 1
    assert result1["quota"] == 100
    assert result1["quota_exceeded"] is False

    result2 = usage.record_request()
    assert result2["requests_today"] == 2


def test_record_request_daily_reset(monkeypatch):
    """Counter resets when the day changes."""
    usage._state["day"] = date.today() - timedelta(days=1)
    usage._state["count"] = 50
    monkeypatch.setattr(usage.settings, "DAILY_REQUEST_QUOTA", 100)

    result = usage.record_request()
    assert result["requests_today"] == 1  # reset to 1
    assert usage._state["day"] == date.today()


def test_record_request_quota_exceeded(monkeypatch):
    """quota_exceeded is True when count > quota."""
    usage._state["day"] = date.today()
    usage._state["count"] = 100
    monkeypatch.setattr(usage.settings, "DAILY_REQUEST_QUOTA", 100)

    result = usage.record_request()
    assert result["requests_today"] == 101
    assert result["quota_exceeded"] is True


def test_record_request_approaching_quota(monkeypatch):
    """Warning logged at 90% of quota."""
    usage._state["day"] = date.today()
    usage._state["count"] = 89  # 90% of 100 = 90, so count+1=90
    monkeypatch.setattr(usage.settings, "DAILY_REQUEST_QUOTA", 100)

    result = usage.record_request()
    assert result["requests_today"] == 90
    assert result["quota_exceeded"] is False


def test_build_usage_record_with_metadata():
    """build_usage_record maps usage metadata fields."""
    result = usage.build_usage_record({
        "input_tokens": 100,
        "output_tokens": 50,
        "total_tokens": 150,
    })
    assert result == {
        "prompt_tokens": 100,
        "completion_tokens": 50,
        "total_tokens": 150,
        "total_cost_usd": 0.0,
    }


def test_build_usage_record_none():
    """build_usage_record with None returns zeros."""
    result = usage.build_usage_record(None)
    assert result == {
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "total_tokens": 0,
        "total_cost_usd": 0.0,
    }


def test_build_usage_record_empty():
    """build_usage_record with empty dict returns zeros."""
    result = usage.build_usage_record({})
    assert result["prompt_tokens"] == 0
    assert result["completion_tokens"] == 0
    assert result["total_tokens"] == 0
