"""
Unit tests for app.events (GenerationEvent observer).

Verifies:
- GenerationEvent dataclass fields
- subscribe() adds a listener
- publish() calls all listeners
- subscribe() is idempotent (no duplicate listeners)
- publish() handles listener exceptions gracefully
"""

from app.events import GenerationEvent, publish, subscribe


def test_generation_event_creation():
    """GenerationEvent stores all fields."""
    event = GenerationEvent(
        project_id="proj-1",
        artifact_type="user_story",
        eval_score=0.9,
        model_used="groq-model",
        retry_count=2,
        usage={"prompt_tokens": 10, "completion_tokens": 5},
    )
    assert event.project_id == "proj-1"
    assert event.artifact_type == "user_story"
    assert event.eval_score == 0.9
    assert event.model_used == "groq-model"
    assert event.retry_count == 2
    assert event.usage == {"prompt_tokens": 10, "completion_tokens": 5}


def test_generation_event_default_usage():
    """GenerationEvent defaults usage to empty dict."""
    event = GenerationEvent(
        project_id="proj-1", artifact_type="task",
        eval_score=0.5, model_used="m", retry_count=0,
    )
    assert event.usage == {}


def test_subscribe_and_publish():
    """subscribe adds a listener; publish calls it with the event."""
    calls = []

    def listener(event):
        calls.append(event)

    subscribe(listener)
    event = GenerationEvent("p1", "user_story", 0.8, "m", 0, {})
    publish(event)
    assert len(calls) == 1
    assert calls[0] is event


def test_subscribe_idempotent():
    """Subscribing the same listener twice doesn't create duplicates."""
    calls = []

    def listener(event):
        calls.append(event)

    subscribe(listener)
    subscribe(listener)
    event = GenerationEvent("p1", "task", 0.5, "m", 0, {})
    publish(event)
    assert len(calls) == 1


def test_publish_handles_listener_exception():
    """publish catches exceptions from individual listeners and continues."""
    calls = []

    def failing_listener(event):
        raise RuntimeError("listener boom")

    def good_listener(event):
        calls.append(event)

    subscribe(failing_listener)
    subscribe(good_listener)
    event = GenerationEvent("p1", "user_story", 0.8, "m", 0, {})
    # Should not raise
    publish(event)
    assert len(calls) == 1


def test_publish_no_listeners():
    """publish with no listeners is a no-op."""
    # Should not raise
    publish(GenerationEvent("p1", "task", 0.5, "m", 0, {}))
