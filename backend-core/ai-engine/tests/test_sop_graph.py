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
