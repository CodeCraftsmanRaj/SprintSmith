from app.pipeline.validators import LLMJudgeValidator, SchemaValidator, ValidationChain


def test_schema_validator_returns_failure_reason_when_schema_does_not_match(monkeypatch):
    import app.pipeline.quality_check as quality_check

    calls = []
    monkeypatch.setattr(
        quality_check,
        "format_compliance_score",
        lambda raw, schema: calls.append((raw, schema)) or False,
    )
    schema = object()
    validator = SchemaValidator(schema)

    passed, reason = validator.validate({"title": "Draft"}, "Create a title")

    assert not passed
    assert reason == "Output does not conform to the required JSON schema."
    assert calls == [('{"title": "Draft"}', schema)]


def test_schema_validator_returns_empty_reason_for_valid_schema(monkeypatch):
    import app.pipeline.quality_check as quality_check

    monkeypatch.setattr(quality_check, "format_compliance_score", lambda raw, schema: True)

    assert SchemaValidator(object()).validate({"ok": True}, "requirement") == (True, "")


def test_llm_judge_validator_forwards_config_and_tracks_score(monkeypatch):
    import app.pipeline.sop_graph as sop_graph

    calls = []
    monkeypatch.setattr(
        sop_graph,
        "judge_score",
        lambda requirement, artifact, config: calls.append((requirement, artifact, config))
        or (0.85, "meets acceptance criteria"),
    )
    config = {"model": "judge-test"}
    validator = LLMJudgeValidator(threshold=0.8, config=config)

    passed, reason = validator.validate({"title": "Draft"}, "Create a title")

    assert passed
    assert reason == "meets acceptance criteria"
    assert validator.score == 0.85
    assert calls == [("Create a title", '{"title": "Draft"}', config)]


def test_llm_judge_validator_fails_at_threshold_and_preserves_reason(monkeypatch):
    import app.pipeline.sop_graph as sop_graph

    monkeypatch.setattr(sop_graph, "judge_score", lambda *args, **kwargs: (0.4, "missing steps"))
    validator = LLMJudgeValidator(threshold=0.5)

    assert validator.validate({}, "requirement") == (False, "missing steps")
    assert validator.score == 0.4


def test_validation_chain_stops_on_first_failure():
    class SpyValidator:
        def __init__(self, name, result):
            self.name = name
            self.result = result
            self.called = False

        def validate(self, artifact, requirement):
            self.called = True
            return self.result

    first = SpyValidator("schema", (False, "invalid"))
    second = SpyValidator("judge", (True, ""))

    passed, failures = ValidationChain([first, second]).run({}, "requirement")

    assert not passed
    assert failures == ["[schema] invalid"]
    assert first.called
    assert not second.called


def test_validation_chain_runs_every_validator_when_all_pass():
    class PassingValidator:
        name = "pass"

        def __init__(self):
            self.calls = 0

        def validate(self, artifact, requirement):
            self.calls += 1
            return True, ""

    validator = PassingValidator()

    assert ValidationChain([validator, validator]).run({"x": 1}, "requirement") == (True, [])
    assert validator.calls == 2


def test_empty_validation_chain_passes():
    assert ValidationChain([]).run({}, "requirement") == (True, [])
