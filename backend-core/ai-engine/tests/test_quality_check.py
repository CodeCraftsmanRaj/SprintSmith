"""
Unit tests for app.pipeline.quality_check.

Verifies:
- _strip_code_fences removes markdown fences
- _extract_text extracts content from objects with .content
- generate_with_quality_check retries on parse errors
- generate_with_quality_check falls back on provider errors
- generate_with_quality_check raises when all attempts fail
- consistency_score computes agreement between outputs
- format_compliance_score validates raw text against schema
"""

from app.pipeline.quality_check import (
    _extract_text,
    _strip_code_fences,
    consistency_score,
    format_compliance_score,
    generate_with_quality_check,
)


class FakeRaw:
    def __init__(self, content):
        self.content = content


def test_strip_code_fences():
    """_strip_code_fences removes ```json and ``` fences."""
    text = "```json\n{\"key\": \"value\"}\n```"
    result = _strip_code_fences(text)
    assert "```" not in result
    assert '"key": "value"' in result


def test_strip_code_fences_no_fences():
    """_strip_code_fences leaves plain text unchanged."""
    text = "Just some plain text"
    result = _strip_code_fences(text)
    assert result == "Just some plain text"


def test_extract_text_with_content():
    """_extract_text returns .content when available."""
    raw = FakeRaw("hello world")
    assert _extract_text(raw) == "hello world"


def test_extract_text_plain_string():
    """_extract_text returns str(raw) when no .content."""
    assert _extract_text("plain string") == "plain string"


class FakeChain:
    def __init__(self, responses):
        self.responses = responses
        self.call_count = 0

    def invoke(self, inputs):
        self.call_count += 1
        response = self.responses[min(self.call_count - 1, len(self.responses) - 1)]
        if isinstance(response, Exception):
            raise response
        return FakeRaw(response)


def test_generate_with_quality_check_success_first_try():
    """Returns parsed result on first successful attempt."""
    class FakeParser:
        def parse(self, text):
            return {"parsed": True}

    chain = FakeChain(['{"key": "value"}'])
    result, raw = generate_with_quality_check(chain, {"requirement": "x"}, FakeParser())
    assert result == {"parsed": True}


def test_generate_with_quality_check_retries_on_parse_error():
    """Retries with repair note on parse errors, then succeeds."""
    class FakeParser:
        def parse(self, text):
            if "invalid" in text:
                raise ValueError("bad json")
            return {"parsed": True}

    chain = FakeChain(["invalid output", '{"parsed": true}'])
    result, raw = generate_with_quality_check(chain, {"requirement": "x"}, FakeParser(), max_retries=3)
    assert result == {"parsed": True}
    assert chain.call_count == 2


def test_generate_with_quality_check_fallback_on_provider_error():
    """Switches to fallback chain on provider-side failure."""
    class FakeParser:
        def parse(self, text):
            return {"fallback": True}

    primary = FakeChain([RuntimeError("provider down")])
    fallback = FakeChain(['{"fallback": true}'])

    result, raw = generate_with_quality_check(
        primary, {"requirement": "x"}, FakeParser(),
        max_retries=2, fallback_chain=fallback,
    )
    assert result == {"fallback": True}


def test_generate_with_quality_check_raises_when_all_fail():
    """Raises RuntimeError when primary and fallback both fail."""
    class FakeParser:
        def parse(self, text):
            return {}

    def failing_chain(inputs):
        raise RuntimeError("always fails")

    import pytest
    with pytest.raises(RuntimeError, match="Generation failed"):
        generate_with_quality_check(
            failing_chain, {"requirement": "x"}, FakeParser(),
            max_retries=1, fallback_chain=failing_chain,
        )


def test_consistency_score():
    """consistency_score computes agreement between two dicts."""
    a = {"x": 1, "y": 2, "z": 3}
    b = {"x": 1, "y": 5, "z": 3}
    assert consistency_score(a, b) == 2 / 3

    c = {"x": 1, "y": 2}
    d = {"x": 1, "y": 2}
    assert consistency_score(c, d) == 1.0

    e = {"x": 1}
    f = {"y": 2}
    assert consistency_score(e, f) == 0.0

    assert consistency_score({}, {}) == 1.0


def test_format_compliance_score_true(monkeypatch):
    """format_compliance_score returns True for valid raw text."""
    class FakeParser:
        def parse(self, text):
            import json
            return json.loads(text)

    def fake_get_parser(schema_cls):
        return FakeParser()

    monkeypatch.setattr("app.llm.parsers.get_parser", fake_get_parser)

    raw = '{"title": "Test", "story": "As a user"}'
    assert format_compliance_score(raw, "any_schema") is True


def test_format_compliance_score_false(monkeypatch):
    """format_compliance_score returns False for invalid raw text."""
    class FakeParser:
        def parse(self, text):
            raise ValueError("bad json")

    def fake_get_parser(schema_cls):
        return FakeParser()

    monkeypatch.setattr("app.llm.parsers.get_parser", fake_get_parser)

    raw = "not json at all"
    assert format_compliance_score(raw, "any_schema") is False
