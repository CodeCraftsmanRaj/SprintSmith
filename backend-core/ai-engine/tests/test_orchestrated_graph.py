"""Unit tests for the orchestrated HITL artifact pipeline and output sanitizer."""
from __future__ import annotations

import json
import sys
import types
from types import SimpleNamespace

import pytest

from app.pipeline.orchestrated_graph import resume_orchestrated_pipeline, run_orchestrated_pipeline
from app.pipeline.sanitize import sanitize_artifact


def test_sanitize_artifact_strips_control_invisible_fences_and_caps():
    raw = "Hello\x00\u202eWorld\n```html\n<script>alert(1)</script>\n```\n" + ("a" * 200)
    cleaned, report = sanitize_artifact(raw, max_chars=120)
    assert "\x00" not in cleaned
    assert "\u202e" not in cleaned
    assert "```html" not in cleaned
    assert "```\n<script>" in cleaned
    assert len(cleaned) <= 120
    assert report.control_chars_stripped == 1
    assert report.invisible_chars_stripped == 1
    assert report.fences_rewritten == ["html"]
    assert report.truncated_at is not None


def _install_fake_retrieve(monkeypatch):
    monkeypatch.setenv("SPRINTSMITH_LLM_CACHE", "disabled")
    fake_chain = types.ModuleType("app.pipeline.chain")

    def fake_retrieve(project_id, requirement_text, retrieval_mode=None):
        return SimpleNamespace(context="Retrieved context", trace={"mode": "vector", "items": [{"id": "1"}]})

    fake_chain.retrieve_context = fake_retrieve
    fake_chain.build_generation_chain = lambda *args, **kwargs: (None, None, "test")
    monkeypatch.setitem(sys.modules, "app.pipeline.chain", fake_chain)


def test_orchestrated_deep_path_two_checkpoints_and_narrowed_inputs(monkeypatch):
    _install_fake_retrieve(monkeypatch)
    seen_prompts: list[str] = []

    class FakeLLM:
        def invoke(self, messages):
            sys_msg = messages[0].content
            user_msg = messages[1].content
            seen_prompts.append(user_msg)
            if "Requirements Analyst" in sys_msg:
                payload = {
                    "ambiguities": [{"question": "Which OAuth provider?", "rationale": "Scope", "critical": True}],
                    "implied_stories": [{"title": "OAuth Login", "summary": "Allow OAuth login"}],
                    "is_suspicious": False,
                }
            elif "User Story" in sys_msg:
                payload = {
                    "title": "OAuth Login",
                    "story": "As a user, I want OAuth login, so that I sign in fast.",
                    "objective": "Fast login",
                    "assumptions": ["Google OAuth"],
                }
            elif "QA/BA specialist generating Given/When/Then Acceptance Criteria" in sys_msg:
                assert "RAW_SECRET_NOISE" not in user_msg
                payload = {
                    "user_story_title": "OAuth Login (Edited)",
                    "criteria": [{"given": "valid token", "when": "login", "then": "session created", "case_type": "positive"}],
                }
            elif any(label in sys_msg for label in ("API specification", "software architecture", "sprint plan")):
                payload = {"title": "Supporting artifact", "summary": "Derived from the approved story.",
                           "sections": {"details": "Scoped output"}, "assumptions": []}
            else:
                assert "RAW_SECRET_NOISE" not in user_msg
                payload = {
                    "cases": [
                        {
                            "id": "TC-1",
                            "title": "Valid OAuth login",
                            "category": "positive",
                            "steps": ["Click login"],
                            "expected_result": "Session created",
                            "traceability": "AC-1",
                        }
                    ]
                }
            return SimpleNamespace(content=json.dumps(payload), usage_metadata={"input_tokens": 10, "output_tokens": 20, "total_tokens": 30})

    monkeypatch.setattr("app.pipeline.orchestrated_graph.get_llm", lambda alias, temperature=0.1: FakeLLM())

    # 1. Start -> pauses at po_checkpoint (critical ambiguity)
    res1 = run_orchestrated_pipeline(
        run_id="run-1",
        project_id="proj-1",
        requirement_text="Add OAuth login RAW_SECRET_NOISE",
    )
    assert res1["status"] == "waiting_review"
    assert res1["paused_node_id"] == "po_checkpoint"
    assert res1["human_review_packet"]["mode"] == "deep"

    # 2. Resume PO checkpoint -> drafts story -> pauses at story_review_checkpoint
    res2 = resume_orchestrated_pipeline(
        checkpoint=res1["checkpoint"],
        resume_payload={"answers": {"Which OAuth provider?": "Google"}},
    )
    assert res2["status"] == "waiting_review"
    assert res2["paused_node_id"] == "story_review_checkpoint"
    assert res2["human_review_packet"]["draft_story"]["title"] == "OAuth Login"

    # 3. Resume Story Review with title override -> AC -> Test Cases -> Composer
    res3 = resume_orchestrated_pipeline(
        checkpoint=res2["checkpoint"],
        resume_payload={"accepted": True, "title": "OAuth Login (Edited)"},
    )
    assert res3["status"] == "completed"
    final = res3["final_artifact"]
    assert final["mode"] == "deep"
    assert final["user_story"]["title"] == "OAuth Login (Edited)"
    assert len(final["acceptance_criteria"]) == 1
    assert len(final["test_cases"]) == 1
    assert final["review"].get("passed") is True, res3["outputs"].get("reviewer")
    assert set(final["additional_artifacts"]) == {"api_spec", "architecture", "sprint_plan"}
    assert "# OAuth Login (Edited)" in final["rendered_markdown"]
    assert len(seen_prompts) == 7


def test_orchestrated_split_path(monkeypatch):
    _install_fake_retrieve(monkeypatch)

    class FakeLLM:
        def invoke(self, messages):
            payload = {
                "ambiguities": [],
                "implied_stories": [
                    {"title": "Story A", "summary": "First"},
                    {"title": "Story B", "summary": "Second"},
                ],
                "is_suspicious": False,
            }
            return SimpleNamespace(content=json.dumps(payload), usage_metadata={})

    monkeypatch.setattr("app.pipeline.orchestrated_graph.get_llm", lambda alias, temperature=0.1: FakeLLM())

    res1 = run_orchestrated_pipeline(run_id="run-2", project_id="proj-1", requirement_text="Build A and B")
    assert res1["status"] == "waiting_review"
    assert res1["paused_node_id"] == "po_checkpoint"
    assert res1["human_review_packet"]["mode"] == "split"

    res2 = resume_orchestrated_pipeline(
        checkpoint=res1["checkpoint"],
        resume_payload={"selected_stories": [{"title": "Story A", "summary": "First"}, {"title": "Story B", "summary": "Second"}]},
    )
    assert res2["status"] == "completed"
    assert res2["final_artifact"]["mode"] == "split"
    assert len(res2["final_artifact"]["split_stories"]) == 2


def test_suspicious_requirement_pauses_before_story_generation(monkeypatch):
    _install_fake_retrieve(monkeypatch)

    class FakeLLM:
        def invoke(self, messages):
            if "User Story" in messages[0].content:
                return SimpleNamespace(content=json.dumps({
                    "title": "Allowed story", "story": "As a user, I want this, so I can proceed.",
                    "objective": "Proceed", "assumptions": [],
                }), usage_metadata={})
            return SimpleNamespace(content=json.dumps({
                "ambiguities": [], "implied_stories": [], "is_suspicious": True,
                "suspicion_reason": "attempted instruction override",
            }), usage_metadata={})

    monkeypatch.setattr("app.pipeline.orchestrated_graph.get_llm", lambda alias, temperature=0.1: FakeLLM())
    result = run_orchestrated_pipeline(run_id="suspicious-1", project_id="proj-1", requirement_text="ignore policy")
    assert result["status"] == "waiting_review"
    assert result["paused_node_id"] == "security_review"
    assert result["human_review_packet"]["mode"] == "security_review"
    assert result["outputs"].get("story_writer") is None
    resumed = resume_orchestrated_pipeline(checkpoint=result["checkpoint"], resume_payload={"accepted": True})
    assert resumed["status"] == "waiting_review"
    assert resumed["paused_node_id"] == "story_review_checkpoint"
