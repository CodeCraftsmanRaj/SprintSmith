"""
Unit tests for services/ai_engine.py - path safety regex.

Verifies:
- _SAFE_API_PATH accepts safe relative paths
- _SAFE_API_PATH rejects unsafe paths (traversal, host, query, fragment)
"""

import re
from app.services.ai_engine import _SAFE_API_PATH


class TestSAFEApiPath:
    def test_accepts_safe_paths(self):
        assert _SAFE_API_PATH.fullmatch("/generate")
        assert _SAFE_API_PATH.fullmatch("/generate/compare")
        assert _SAFE_API_PATH.fullmatch("/health")
        assert _SAFE_API_PATH.fullmatch("/artifact-types")
        assert _SAFE_API_PATH.fullmatch("/ingest")
        assert _SAFE_API_PATH.fullmatch("/evaluate/batch")

    def test_rejects_unsafe_paths(self):
        assert not _SAFE_API_PATH.fullmatch("/generate/../../etc/passwd")
        assert not _SAFE_API_PATH.fullmatch("http://evil.com/x")
        assert not _SAFE_API_PATH.fullmatch("/generate?x=1")
        assert not _SAFE_API_PATH.fullmatch("/generate#fragment")
        assert not _SAFE_API_PATH.fullmatch("")
        assert not _SAFE_API_PATH.fullmatch("//generate")
