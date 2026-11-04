"""
Unit tests for services/ai_engine.py - port interface.

Verifies:
- AIEnginePort is an abstract base class
- All required methods are defined
"""

import pytest
from app.ports.ai_engine_port import AIEnginePort


def test_ai_engine_port_is_abstract():
    """AIEnginePort cannot be instantiated directly."""
    with pytest.raises(TypeError):
        AIEnginePort()


def test_ai_engine_port_has_required_methods():
    """AIEnginePort defines all required abstract methods."""
    methods = ["generate", "ingest", "ingest_status", "artifact_types",
               "stream_generate", "generate_compare", "evaluate_batch"]
    for method in methods:
        assert hasattr(AIEnginePort, method), f"Missing method: {method}"


def test_ai_engine_client_implements_port():
    """AIEngineClient implements AIEnginePort."""
    from app.services.ai_engine import AIEngineClient
    assert issubclass(AIEngineClient, AIEnginePort)
