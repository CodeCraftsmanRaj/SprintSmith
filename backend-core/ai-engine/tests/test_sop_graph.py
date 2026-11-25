"""
Unit tests for app.pipeline.sop_graph.

Verifies:
- _initial_state creates correct state dict
- should_continue routing logic
- _extract_text extracts content
- _accumulate merges usage dicts
- _get_schema resolves schema from registry
- judge_score fallback when LLM unavailable
- qa_node schema validation
- finalize_node returns empty dict
- build_sop_graph creates compiled graph
- run_sop_generation orchestrates the full SOP flow
"""

from app.pipeline.sop_graph import (
    APPROVAL_THRESHOLD,
    MAX_RETRIES,
    _accumulate,
    _extract_text,
    _get_schema,
    _initial_state,
    build_sop_graph,
    should_continue,
)
from app.pipeline import sop_graph


def test_initial_state():
    """_initial_state returns a complete ArtifactState dict."""
    state = _initial_state("user_story", "proj-1", "As a user, I want to log in", "groq-model")
    assert state["artifact_type"] == "user_story"
    assert state["project_id"] == "proj-1"
    assert state["requirement_text"] == "As a user, I want to log in"
    assert state["model_alias"] == "groq-model"
    assert state["retrieval_mode"] is None
    assert state["context"] == ""
    assert state["retrieval_trace"] == {}
    assert state["draft_raw"] == ""
    assert state["eval_score"] == 0.0
    assert state["critique"] == ""
    assert state["retry_count"] == 0
    assert state["final_artifact"] == {}
    assert state["prompt_version"] == ""
    assert state["usage"] == {}
    assert state["model_used"] == ""


def test_initial_state_with_retrieval_mode():
    """_initial_state accepts retrieval_mode parameter."""
    state = _initial_state("task", "proj-2", "Do something", None, "hybrid")
    assert state["retrieval_mode"] == "hybrid"
    assert state["model_alias"] is not None  # defaults to DEFAULT_LLM


def test_extract_text():
    """_extract_text returns .content when available."""
    class FakeRaw:
        content = "extracted text"
    assert _extract_text(FakeRaw()) == "extracted text"
    assert _extract_text("plain string") == "plain string"


def test_accumulate():
    """_accumulate merges usage dicts correctly."""
    usage = {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}
    add = {"input_tokens": 20, "output_tokens": 10, "total_tokens": 30}
    result = _accumulate(usage, add)
    assert result["prompt_tokens"] == 30
    assert result["completion_tokens"] == 15
    assert result["total_tokens"] == 45


def test_accumulate_empty_add():
    """_accumulate with empty add returns original usage."""
    usage = {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}
    result = _accumulate(usage, {})
    assert result == usage


def test_accumulate_none_add():
    """_accumulate with None add returns original usage."""
    usage = {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}
    result = _accumulate(usage, None)
    assert result == usage


def test_should_continue_finalize_when_approved():
    """should_continue returns 'finalize' when eval_score >= threshold."""
    state = {"eval_score": 0.9, "retry_count": 0, "artifact_type": "user_story"}
    assert should_continue(state) == "finalize"


def test_should_continue_finalize_when_retries_exhausted():
    """should_continue returns 'finalize' when retries exhausted."""
    state = {"eval_score": 0.5, "retry_count": MAX_RETRIES, "artifact_type": "user_story"}
    assert should_continue(state) == "finalize"


def test_should_continue_revise():
    """should_continue returns 'revise' when not approved and retries remain."""
    state = {"eval_score": 0.5, "retry_count": 0, "artifact_type": "user_story"}
    assert should_continue(state) == "revise"


def test_build_sop_graph():
    """build_sop_graph returns a compiled graph."""
    graph = build_sop_graph()
    assert graph is not None


def test_pm_node_passes_langfuse_config_to_generation_chain(monkeypatch):
    config = {"callbacks": [object()]}
    observed = {}

    class FakeRaw:
        content = '{"title": "draft"}'
        usage_metadata = {"input_tokens": 3, "output_tokens": 4, "total_tokens": 7}

    class FakeChain:
        def invoke(self, inputs, config=None):
            observed["inputs"] = inputs
            observed["config"] = config
            return FakeRaw()

    monkeypatch.setattr(sop_graph, "build_generation_chain",
                        lambda *args, **kwargs: (FakeChain(), None, "prompt-v1"))
    state = _initial_state("user_story", "p1", "Write a story", "test-model")
    state["context"] = "retrieved context"

    result = sop_graph.pm_node(state, config=config)

    assert observed["config"] is config
    assert observed["inputs"]["context"] == "retrieved context"
    assert result["draft_raw"] == '{"title": "draft"}'
    assert result["usage"]["total_tokens"] == 7


def test_judge_score_passes_langfuse_config(monkeypatch):
    config = {"callbacks": [object()]}
    observed = {}

    class FakeLLM:
        def invoke(self, prompt, config=None):
            observed["prompt"] = prompt
            observed["config"] = config
            return type("Message", (), {"content": '{"score": 0.91, "reasoning": "complete"}'})()

    monkeypatch.setattr(sop_graph, "get_llm", lambda *args, **kwargs: FakeLLM())

    score, reason = sop_graph.judge_score("requirement", "artifact", config=config)

    assert observed["config"] is config
    assert "requirement" in observed["prompt"]
    assert score == 0.91
    assert reason == "complete"


def test_run_sop_generation_attaches_config_and_flushes(monkeypatch):
    config = {"callbacks": [object()]}
    observed = {}

    class FakeGraph:
        def invoke(self, state, config=None):
            observed["config"] = config
            return {
                **state,
                "final_artifact": {"title": "done"},
                "eval_score": 0.9,
                "retry_count": 0,
                "prompt_version": "prompt-v1",
                "model_used": "test-model",
            }

    monkeypatch.setattr(sop_graph, "build_langfuse_config", lambda **kwargs: config)
    monkeypatch.setattr(sop_graph, "flush_langfuse", lambda: observed.setdefault("flushed", True))
    monkeypatch.setattr(sop_graph, "SOP_GRAPH", FakeGraph())
    monkeypatch.setattr("app.events.publish", lambda event: None)

    result = sop_graph.run_sop_generation(
        "user_story", "p1", "requirement", object(), request_id="request-1",
    )

    assert observed["config"] is config
    assert observed["flushed"] is True
    assert result["output"] == {"title": "done"}
    assert result["project_id"] == "p1"


def test_retrieve_node_handles_default_and_explicit_retrieval_mode(monkeypatch):
    calls = []

    class FakeResult:
        def __init__(self, mode):
            self.context = f"ctx-{mode}"
            self.trace = {"mode": mode}

    def fake_retrieve(project_id, requirement_text, **kwargs):
        calls.append((project_id, requirement_text, kwargs))
        return FakeResult(kwargs.get("retrieval_mode", "default"))

    monkeypatch.setattr(sop_graph, "retrieve_context", fake_retrieve)

    res_default = sop_graph.retrieve_node(_initial_state("user_story", "p1", "req", "m1"))
    assert res_default == {"context": "ctx-default", "retrieval_trace": {"mode": "default"}}
    assert calls[0][2] == {}

    res_hybrid = sop_graph.retrieve_node(_initial_state("user_story", "p1", "req", "m1", "hybrid"))
    assert res_hybrid == {"context": "ctx-hybrid", "retrieval_trace": {"mode": "hybrid"}}
    assert calls[1][2] == {"retrieval_mode": "hybrid"}


def test_pm_node_adds_repair_note_and_falls_back_on_error(monkeypatch):
    calls = []

    class FakeRaw:
        content = '{"title": "repaired"}'
        usage_metadata = None

    class FailingChain:
        def invoke(self, inputs, config=None):
            calls.append(("primary", inputs))
            raise RuntimeError("rate limit")

    class FallbackChain:
        def invoke(self, inputs, config=None):
            calls.append(("fallback", inputs))
            return FakeRaw()

    def fake_build(artifact_type, schema_cls, model_alias=None):
        if model_alias == sop_graph.settings.FALLBACK_LLM:
            return FallbackChain(), None, "prompt-v2"
        return FailingChain(), None, "prompt-v1"

    monkeypatch.setattr(sop_graph, "build_generation_chain", fake_build)
    state = _initial_state("user_story", "p1", "Write a story", "primary-alias")
    state["retry_count"] = 1
    state["critique"] = "Missing acceptance criteria"

    result = sop_graph.pm_node(state)

    assert len(calls) == 2
    assert "Missing acceptance criteria" in calls[0][1]["repair_note"]
    assert result["draft_raw"] == '{"title": "repaired"}'
    assert result["model_used"] == sop_graph.settings.FALLBACK_LLM


def test_pm_node_reraises_when_no_distinct_fallback(monkeypatch):
    import pytest

    class FailingChain:
        def invoke(self, inputs, config=None):
            raise RuntimeError("provider down")

    monkeypatch.setattr(
        sop_graph,
        "build_generation_chain",
        lambda *args, **kwargs: (FailingChain(), None, "prompt-v1"),
    )
    state = _initial_state("user_story", "p1", "req", sop_graph.settings.FALLBACK_LLM)

    with pytest.raises(RuntimeError, match="provider down"):
        sop_graph.pm_node(state)


def test_judge_score_falls_back_on_out_of_range_or_error(monkeypatch):
    class OutOfRangeLLM:
        def invoke(self, prompt, config=None):
            return type("Msg", (), {"content": '{"score": 1.5, "reasoning": "bad"}'})()

    monkeypatch.setattr(sop_graph, "get_llm", lambda *args, **kwargs: OutOfRangeLLM())
    score, reason = sop_graph.judge_score("req", "{}")
    assert score == 0.85
    assert "judge skipped:" in reason

    monkeypatch.setattr(sop_graph, "get_llm", lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("down")))
    score2, reason2 = sop_graph.judge_score("req", "{}")
    assert score2 == 0.85
    assert "down" in reason2


def test_qa_node_handles_parse_error_pass_and_fail(monkeypatch):
    from pydantic import BaseModel

    class DummySchema(BaseModel):
        title: str

    monkeypatch.setattr(sop_graph, "_get_schema", lambda _t: DummySchema)

    # 1. Parse failure
    bad_state = _initial_state("user_story", "p1", "req", "m1")
    bad_state["draft_raw"] = "not json"
    bad_res = sop_graph.qa_node(bad_state)
    assert bad_res["eval_score"] == 0.0
    assert bad_res["retry_count"] == 1

    # 2. Validation passes
    class FakePassChain:
        def __init__(self, validators):
            self.judge = validators[1]

        def run(self, data, req):
            self.judge.score = 0.92
            return True, []

    monkeypatch.setattr("app.pipeline.validators.ValidationChain", FakePassChain)
    good_state = _initial_state("user_story", "p1", "req", "m1")
    good_state["draft_raw"] = '{"title": "Valid"}'
    good_res = sop_graph.qa_node(good_state)
    assert good_res["eval_score"] == 0.92
    assert good_res["critique"] == "All validators passed."
    assert good_res["retry_count"] == 0

    # 3. Validation fails
    class FakeFailChain:
        def __init__(self, validators):
            self.judge = validators[1]

        def run(self, data, req):
            self.judge.score = 0.4
            return False, ["Incomplete"]

    monkeypatch.setattr("app.pipeline.validators.ValidationChain", FakeFailChain)
    fail_res = sop_graph.qa_node(good_state)
    assert fail_res["eval_score"] == 0.4
    assert fail_res["critique"] == "Incomplete"
    assert fail_res["retry_count"] == 1


def test_finalize_node_and_run_sop_generation_without_config_or_artifact(monkeypatch):
    import pytest

    assert sop_graph.finalize_node({}) == {}

    class EmptyGraph:
        def invoke(self, state, config=None):
            return {**state, "final_artifact": {}}

    monkeypatch.setattr(sop_graph, "build_langfuse_config", lambda **kwargs: None)
    monkeypatch.setattr(sop_graph, "flush_langfuse", lambda: None)
    monkeypatch.setattr(sop_graph, "SOP_GRAPH", EmptyGraph())

    with pytest.raises(RuntimeError, match="produced no artifact"):
        sop_graph.run_sop_generation("user_story", "p1", "req", object())
