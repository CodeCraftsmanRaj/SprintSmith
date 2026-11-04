"""Focused API tests that replace the model graph and avoid provider dependencies."""
import asyncio
import importlib
import sys
from types import ModuleType
from unittest.mock import Mock

import pytest
from fastapi import HTTPException


@pytest.fixture
def generate_api(monkeypatch):
    pipeline = importlib.import_module("app.pipeline")
    api_package = importlib.import_module("app.api.v1")
    graph = ModuleType("app.pipeline.sop_graph")
    graph.run_sop_generation = Mock()
    graph.SOP_GRAPH = None

    original_generate_module = sys.modules.pop("app.api.v1.generate", None)
    had_generate_attribute = hasattr(api_package, "generate")
    original_generate_attribute = getattr(api_package, "generate", None)
    if had_generate_attribute:
        delattr(api_package, "generate")

    with monkeypatch.context() as patcher:
        patcher.setitem(sys.modules, "app.pipeline.sop_graph", graph)
        patcher.setattr(pipeline, "sop_graph", graph, raising=False)
        api = importlib.import_module("app.api.v1.generate")
        patcher.setattr(api, "record_request", lambda: {"quota_exceeded": False})
        try:
            yield api, graph
        finally:
            sys.modules.pop("app.api.v1.generate", None)
            if original_generate_module is not None:
                sys.modules["app.api.v1.generate"] = original_generate_module
            if had_generate_attribute:
                api_package.generate = original_generate_attribute
            else:
                api_package.__dict__.pop("generate", None)


def _request(api, **overrides):
    values = {
        "project_id": "project-1",
        "artifact_type": "user_story",
        "requirement_text": "As a customer, I want to transfer funds.",
    }
    values.update(overrides)
    return api.GenerateRequest(**values)


def test_generate_returns_response_and_validates_safe_tokens(generate_api):
    api, graph = generate_api
    result = {
        "artifact_type": "user_story",
        "project_id": "project-1",
        "prompt_version": "user_story_v1",
        "output": {"stories": []},
        "usage": {},
        "latency_ms": 3,
    }
    graph.run_sop_generation.return_value = result

    response = api.generate(_request(api))

    assert response.output == {"stories": []}
    assert response.project_id == "project-1"
    graph.run_sop_generation.assert_called_once()

    with pytest.raises(HTTPException) as exc_info:
        api.generate(_request(api, project_id="../private"))
    assert exc_info.value.status_code == 400

    with pytest.raises(HTTPException) as exc_info:
        api.generate(_request(api, artifact_type="unknown"))
    assert exc_info.value.status_code == 400


def test_generate_logs_soft_quota_limit(generate_api, caplog, monkeypatch):
    api, graph = generate_api
    monkeypatch.setattr(api, "record_request", lambda: {"quota_exceeded": True})
    graph.run_sop_generation.return_value = {
        "artifact_type": "user_story",
        "project_id": "project-1",
        "prompt_version": "user_story_v1",
        "output": {},
        "usage": {},
    }

    with caplog.at_level("WARNING", logger="sprintsmith.ai_engine"):
        api.generate(_request(api))

    assert "soft limit, not enforced" in caplog.text


@pytest.mark.parametrize(
    ("failure", "expected_status"),
    [(RuntimeError("invalid output"), 502), (ValueError("unexpected failure"), 500)],
)
def test_generate_maps_graph_failures(generate_api, failure, expected_status):
    api, graph = generate_api
    graph.run_sop_generation.side_effect = failure

    with pytest.raises(HTTPException) as exc_info:
        api.generate(_request(api))

    assert exc_info.value.status_code == expected_status


def test_stream_endpoint_emits_completion_and_surfaces_graph_errors(generate_api):
    api, graph = generate_api

    class Graph:
        def __init__(self, fail=False):
            self.fail = fail

        async def astream(self, _initial, stream_mode=None):
            if self.fail:
                raise RuntimeError("graph unavailable")
            yield {"retrieve": {"context": "relevant context"}}
            yield {"finalize": {"final_artifact": {"stories": []}}}

    async def read_stream(fail=False):
        graph.SOP_GRAPH = Graph(fail)
        response = await api.generate_stream(_request(api))
        chunks = [chunk async for chunk in response.body_iterator]
        return "".join(chunk.decode() if isinstance(chunk, bytes) else chunk for chunk in chunks)

    success = asyncio.run(read_stream())
    assert '"node": "done"' in success
    assert success.endswith("data: [DONE]\n\n")

    failure = asyncio.run(read_stream(fail=True))
    assert "graph unavailable" in failure
    assert failure.endswith("data: [DONE]\n\n")


def test_compare_and_batch_endpoint_use_configured_inputs(generate_api, monkeypatch):
    api, graph = generate_api
    graph.run_sop_generation.side_effect = lambda *args: {
        "model_alias": args[-1],
        "output": {},
    }

    compared = asyncio.run(api.generate_compare(_request(api)))
    assert compared["primary"]["model_alias"] == api.settings.DEFAULT_LLM
    assert compared["fallback"]["model_alias"] == api.settings.FALLBACK_LLM

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(api.evaluate_batch(retrieval_mode="semantic"))
    assert exc_info.value.status_code == 400

    evaluation_module = ModuleType("app.evaluation.batch_harness")
    evaluation_module.run_batch_eval = Mock(return_value={"mode": "hybrid"})
    monkeypatch.setitem(sys.modules, "app.evaluation.batch_harness", evaluation_module)
    result = asyncio.run(api.evaluate_batch(project_id="project-1", retrieval_mode="hybrid"))

    assert result == {"mode": "hybrid"}
    evaluation_module.run_batch_eval.assert_called_once_with("project-1", "hybrid")


def test_compare_returns_each_model_failure(generate_api):
    api, graph = generate_api
    graph.run_sop_generation.side_effect = RuntimeError("model unavailable")

    result = asyncio.run(api.generate_compare(_request(api)))

    assert result["primary"] == {
        "error": "model unavailable",
        "model_alias": api.settings.DEFAULT_LLM,
    }
    assert result["fallback"] == {
        "error": "model unavailable",
        "model_alias": api.settings.FALLBACK_LLM,
    }


@pytest.mark.parametrize(
    ("failure", "expected_detail"),
    [
        (FileNotFoundError("evaluation data missing"), "evaluation data missing"),
        (RuntimeError("prerequisite missing"), "Evaluation prerequisites missing"),
    ],
)
def test_batch_evaluation_maps_missing_prerequisites(
    generate_api, monkeypatch, failure, expected_detail
):
    api, _graph = generate_api
    evaluation_module = ModuleType("app.evaluation.batch_harness")
    evaluation_module.run_batch_eval = Mock(side_effect=failure)
    monkeypatch.setitem(sys.modules, "app.evaluation.batch_harness", evaluation_module)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(api.evaluate_batch(project_id="project-1", retrieval_mode="hybrid"))

    assert exc_info.value.status_code == 503
    assert expected_detail in exc_info.value.detail
