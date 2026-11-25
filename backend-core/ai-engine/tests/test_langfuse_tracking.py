import logging
import sys
import types

from app.tracking import langfuse


def _enable(monkeypatch):
    monkeypatch.setattr(langfuse.settings, "LANGFUSE_ENABLED", True)
    monkeypatch.setattr(langfuse.settings, "LANGFUSE_PUBLIC_KEY", "pk-test")
    monkeypatch.setattr(langfuse.settings, "LANGFUSE_SECRET_KEY", "sk-test")


def test_build_config_returns_none_when_disabled(monkeypatch):
    monkeypatch.setattr(langfuse.settings, "LANGFUSE_ENABLED", False)

    assert langfuse.build_langfuse_config(project_id="p1", artifact_type="user_story") is None


def test_build_config_warns_when_keys_are_missing(monkeypatch, caplog):
    monkeypatch.setattr(langfuse.settings, "LANGFUSE_ENABLED", True)
    monkeypatch.setattr(langfuse.settings, "LANGFUSE_PUBLIC_KEY", "")
    monkeypatch.setattr(langfuse.settings, "LANGFUSE_SECRET_KEY", "")

    with caplog.at_level(logging.WARNING, logger=langfuse.logger.name):
        result = langfuse.build_langfuse_config(project_id="p1", artifact_type="task")

    assert result is None
    assert "project keys are missing" in caplog.text


def test_build_config_attaches_callback_and_request_metadata(monkeypatch):
    _enable(monkeypatch)
    handler = object()
    package = types.ModuleType("langfuse")
    package.__path__ = []
    integration = types.ModuleType("langfuse.langchain")
    integration.CallbackHandler = lambda: handler
    monkeypatch.setitem(sys.modules, "langfuse", package)
    monkeypatch.setitem(sys.modules, "langfuse.langchain", integration)

    config = langfuse.build_langfuse_config(
        project_id="project-1", artifact_type="user_story", request_id="request-1",
    )

    assert config["callbacks"] == [handler]
    assert config["run_name"] == "SprintSmith SOP generation"
    assert config["metadata"] == {
        "langfuse_session_id": "project-1",
        "langfuse_tags": ["sprintsmith", "artifact:user_story"],
        "request_id": "request-1",
        "project_id": "project-1",
        "artifact_type": "user_story",
    }


def test_build_config_disables_tracing_when_sdk_initialization_fails(monkeypatch, caplog):
    _enable(monkeypatch)
    package = types.ModuleType("langfuse")
    package.__path__ = []
    integration = types.ModuleType("langfuse.langchain")

    def unavailable():
        raise RuntimeError("SDK unavailable")

    integration.CallbackHandler = unavailable
    monkeypatch.setitem(sys.modules, "langfuse", package)
    monkeypatch.setitem(sys.modules, "langfuse.langchain", integration)

    with caplog.at_level(logging.WARNING, logger=langfuse.logger.name):
        result = langfuse.build_langfuse_config(project_id="p1", artifact_type="task")

    assert result is None
    assert "Could not initialize Langfuse callback" in caplog.text


def test_flush_is_skipped_when_disabled(monkeypatch):
    monkeypatch.setattr(langfuse.settings, "LANGFUSE_ENABLED", False)

    assert langfuse.flush_langfuse() is None


def test_flush_calls_langfuse_client(monkeypatch):
    _enable(monkeypatch)
    client = types.SimpleNamespace(flush=lambda: setattr(client, "flushed", True))
    client.flushed = False
    package = types.ModuleType("langfuse")
    package.get_client = lambda: client
    monkeypatch.setitem(sys.modules, "langfuse", package)

    langfuse.flush_langfuse()

    assert client.flushed is True


def test_flush_logs_and_suppresses_errors(monkeypatch, caplog):
    _enable(monkeypatch)
    package = types.ModuleType("langfuse")

    def broken_client():
        raise RuntimeError("client unavailable")

    package.get_client = broken_client
    monkeypatch.setitem(sys.modules, "langfuse", package)

    with caplog.at_level(logging.WARNING, logger=langfuse.logger.name):
        assert langfuse.flush_langfuse() is None

    assert "Could not flush Langfuse events" in caplog.text
