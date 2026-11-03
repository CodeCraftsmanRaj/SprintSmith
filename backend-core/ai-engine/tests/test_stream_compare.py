"""
SSE streaming (§3.2.4) and parallel LLM compare (§3.2.3) endpoint tests. The SOP graph
is faked; no keys or models needed.
"""
import json

import pytest

from fastapi.testclient import TestClient

from app.main import app
from app.pipeline import sop_graph

CANNED = {
    "artifact_type": "user_story", "project_id": "p1", "prompt_version": "user_story_v1",
    "output": {"stories": []}, "context": "CTX", "retrieval": {"mode": "vector"},
    "usage": {"prompt_tokens": 1, "completion_tokens": 2, "total_tokens": 3, "total_cost_usd": 0.0},
    "eval_score": 0.9, "retry_count": 0,
}


class FakeGraph:
    def __init__(self, updates):
        self._updates = updates

    async def astream(self, initial, stream_mode=None):
        for u in self._updates:
            yield u


def _events(text: str) -> list[dict]:
    out = []
    for block in text.split("\n\n"):
        for line in block.splitlines():
            if line.startswith("data: ") and line != "data: [DONE]":
                out.append(json.loads(line[6:]))
    return out


def test_generate_stream_emits_node_transitions_and_result(monkeypatch):
    updates = [
        {"retrieve": {"context": "CTX", "retrieval_trace": {"mode": "vector"}}},
        {"pm": {"draft_raw": "{}", "prompt_version": "user_story_v1", "usage": {"total_tokens": 3},
                 "model_used": "groq-x"}},
        {"qa": {"final_artifact": {"stories": []}, "eval_score": 0.9, "critique": "", "retry_count": 0}},
        {"finalize": {}},
    ]
    monkeypatch.setattr(sop_graph, "SOP_GRAPH", FakeGraph(updates))

    client = TestClient(app)
    resp = client.post("/generate/stream", json={"project_id": "p1", "artifact_type": "user_story",
                                                 "requirement_text": "reset password"})
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")
    events = _events(resp.text)
    nodes = [e.get("node") for e in events]
    assert nodes == ["retrieve", "pm", "qa", "finalize", "done"]
    done = events[-1]["result"]
    assert done["output"] == {"stories": []}
    assert done["eval_score"] == 0.9
    assert done["retry_count"] == 0


def test_generate_stream_surfaces_errors(monkeypatch):
    class Exploding:
        async def astream(self, initial, stream_mode=None):
            raise RuntimeError("vector retrieval timed out")
            yield {}

    monkeypatch.setattr(sop_graph, "SOP_GRAPH", Exploding())
    client = TestClient(app)
    resp = client.post("/generate/stream", json={"project_id": "p1", "artifact_type": "user_story",
                                                 "requirement_text": "x"})
    events = _events(resp.text)
    assert "timed out" in events[-1]["error"]
    assert resp.text.endswith("data: [DONE]\n\n")


def test_generate_stream_ignores_non_mapping_node_delta(monkeypatch):
    monkeypatch.setattr(sop_graph, "SOP_GRAPH", FakeGraph([{"custom": "diagnostic"}]))

    resp = TestClient(app).post("/generate/stream", json={
        "project_id": "p1", "artifact_type": "user_story", "requirement_text": "x",
    })

    assert resp.status_code == 200
    events = _events(resp.text)
    assert events[0]["node"] == "custom"
    assert events[0]["critique"] == ""
    assert resp.text.endswith("data: [DONE]\n\n")


def test_compare_runs_both_aliases(monkeypatch):
    seen = []

    def fake_run(artifact_type, project_id, requirement_text, schema_cls, model_alias=None):
        seen.append(model_alias)
        if model_alias != "groq-openai/gpt-oss-120b":
            raise RuntimeError("gemini 429")
        return {**CANNED, "model_used": model_alias}

    monkeypatch.setattr(sop_graph, "run_sop_generation", fake_run)

    client = TestClient(app)
    resp = client.post("/generate/compare", json={"project_id": "p1", "artifact_type": "user_story",
                                                  "requirement_text": "reset password"})
    assert resp.status_code == 200
    body = resp.json()
    assert set(seen) == {"groq-openai/gpt-oss-120b", "gemini-3.6-flash"}
    assert body["primary"]["output"] == {"stories": []}
    # A failing model never fails the whole comparison.
    assert "error" in body["fallback"]


def test_generate_persists_eval_fields(monkeypatch):
    monkeypatch.setattr(sop_graph, "run_sop_generation",
                         lambda *a, **k: {**CANNED, "model_used": "groq-x"})
    client = TestClient(app)
    resp = client.post("/generate", json={"project_id": "p1", "artifact_type": "user_story",
                                          "requirement_text": "x"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["eval_score"] == 0.9
    assert body["retry_count"] == 0
    assert body["model_used"] == "groq-x"


def test_generate_soft_quota_warning_does_not_block(monkeypatch, caplog):
    monkeypatch.setattr(sop_graph, "run_sop_generation", lambda *a, **k: CANNED)
    monkeypatch.setattr("app.api.v1.generate.record_request", lambda: {"quota_exceeded": True})

    resp = TestClient(app).post("/generate", json={
        "project_id": "p1", "artifact_type": "user_story", "requirement_text": "x",
    })

    assert resp.status_code == 200
    assert "soft limit, not enforced" in caplog.text


@pytest.mark.parametrize("failure, status_code", [
    (RuntimeError("invalid generated artifact"), 502),
    (ValueError("unexpected engine error"), 500),
])
def test_generate_maps_generation_failures(monkeypatch, failure, status_code):
    def fail(*_args, **_kwargs):
        raise failure

    monkeypatch.setattr(sop_graph, "run_sop_generation", fail)
    resp = TestClient(app).post("/generate", json={
        "project_id": "p1", "artifact_type": "user_story", "requirement_text": "x",
    })

    assert resp.status_code == status_code


def test_unknown_artifact_type_400():
    client = TestClient(app)
    for path in ("/generate", "/generate/stream", "/generate/compare"):
        resp = client.post(path, json={"project_id": "p1", "artifact_type": "nope",
                                       "requirement_text": "x"})
        assert resp.status_code == 400, path


@pytest.mark.parametrize("payload", [
    {"project_id": "../private", "artifact_type": "user_story", "requirement_text": "x"},
    {"project_id": "p1", "artifact_type": "../user_story", "requirement_text": "x"},
])
def test_generate_rejects_invalid_tokens(payload):
    assert TestClient(app).post("/generate", json=payload).status_code == 400


def test_evaluate_batch_rejects_unsupported_retrieval_mode():
    resp = TestClient(app).post("/evaluate/batch?retrieval_mode=semantic")

    assert resp.status_code == 400
    assert resp.json()["detail"] == "retrieval_mode must be vector|hybrid"


def test_evaluate_batch_returns_results(monkeypatch):
    monkeypatch.setattr("app.evaluation.batch_harness.run_batch_eval",
                        lambda project_id, mode: {"project_id": project_id, "mode": mode})

    resp = TestClient(app).post("/evaluate/batch?project_id=p1&retrieval_mode=hybrid")

    assert resp.status_code == 200
    assert resp.json() == {"project_id": "p1", "mode": "hybrid"}


@pytest.mark.parametrize("failure, expected_detail", [
    (FileNotFoundError("golden data missing"), "golden data missing"),
    (RuntimeError("provider unavailable"), "Evaluation prerequisites missing: provider unavailable"),
])
def test_evaluate_batch_maps_missing_prerequisites(monkeypatch, failure, expected_detail):
    def fail(*_args, **_kwargs):
        raise failure

    monkeypatch.setattr("app.evaluation.batch_harness.run_batch_eval", fail)

    resp = TestClient(app).post("/evaluate/batch")

    assert resp.status_code == 503
    assert resp.json()["detail"] == expected_detail


def test_invalid_project_id_400():
    client = TestClient(app)
    # Only the sync /generate endpoint validates the token up front (S5145 log
    # injection guard); /generate/stream and /generate/compare delegate to the
    # graph and surface upstream errors instead.
    resp = client.post("/generate", json={"project_id": "../etc/passwd", "artifact_type": "user_story",
                                          "requirement_text": "x"})
    assert resp.status_code == 400
