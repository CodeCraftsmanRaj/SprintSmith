import pytest

from app.pipeline.llm_errors import LLMNodeFailure
from app.pipeline.orchestrated_graph import _edge_router, _with_node_policy


def test_node_policy_retries_before_returning_success():
    calls = 0

    def flaky(_state):
        nonlocal calls
        calls += 1
        if calls == 1:
            raise TimeoutError("temporary")
        return {"value": "ok"}

    result = _with_node_policy("analyst", flaky)({
        "node_policies": {"analyst": {"retry_count": 1, "fail_strategy": "halt"}},
        "usage": {},
    })
    assert result["value"] == "ok"
    assert calls == 2


def test_node_policy_continue_records_failure_and_event():
    def broken(_state):
        raise ValueError("invalid response")

    result = _with_node_policy("api_spec", broken)({
        "run_id": "run-1",
        "node_policies": {"api_spec": {"retry_count": 0, "fail_strategy": "continue"}},
    })
    assert result["node_failures"]["api_spec"]["error"] == "invalid response"
    assert result["events"][0]["status"] == "failed"


def test_node_policy_halt_raises_structured_failure():
    def broken(_state):
        raise TimeoutError("provider timeout")

    with pytest.raises(LLMNodeFailure) as exc:
        _with_node_policy("analyst", broken)({
            "node_policies": {"analyst": {"retry_count": 1, "fail_strategy": "halt"}},
        })
    assert exc.value.detail["agent"] == "analyst"
    assert exc.value.detail["retries_attempted"] == 1


def test_declarative_router_supports_all_condition_types():
    state = {
        "status": "waiting_review",
        "outputs": {"analyst": {"is_suspicious": True}},
        "analyst_output": {"implied_stories": [{"title": "A"}, {"title": "B"}]},
        "selected_stories": [],
    }
    assert _edge_router(state, [{"type": "on_status", "status": "waiting_review", "destination": "pause"}], "next") == "pause"
    assert _edge_router(state, [{"type": "truthy_output", "path": "analyst.is_suspicious", "destination": "security"}], "next") == "security"
    assert _edge_router(state, [{"type": "contains", "path": "analyst_output.implied_stories", "min_items": 2, "destination": "split"}], "next") == "split"
    assert _edge_router(state, [{"type": "always", "destination": "next"}], "fallback") == "next"
