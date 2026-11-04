"""
Unit tests for app.prompts.registry.

Verifies:
- list_artifact_types() returns directories in PROMPT_DIR
- list_versions() returns version files for an artifact type
- load_prompt() loads latest and specific versions
- load_prompt() raises FileNotFoundError for missing type/version
"""

import os
import tempfile
from pathlib import Path

import pytest

from app.prompts import registry


def test_list_artifact_types(tmp_path, monkeypatch):
    """list_artifact_types returns directory names in PROMPT_DIR."""
    with tempfile.TemporaryDirectory() as tmp:
        prompt_dir = Path(tmp)
        (prompt_dir / "user_story").mkdir()
        (prompt_dir / "task").mkdir()
        (prompt_dir / "not_a_dir_file.txt").write_text("x")

        monkeypatch.setattr(registry, "PROMPT_DIR", prompt_dir)
        types = registry.list_artifact_types()
        assert "user_story" in types
        assert "task" in types


def test_list_versions(tmp_path, monkeypatch):
    """list_versions returns sorted version file stems."""
    with tempfile.TemporaryDirectory() as tmp:
        artifact_dir = Path(tmp) / "user_story"
        artifact_dir.mkdir()
        (artifact_dir / "v2.yaml").write_text("system: x\nhuman: y")
        (artifact_dir / "v1.yaml").write_text("system: x\nhuman: y")
        (artifact_dir / "README.md").write_text("ignore")

        monkeypatch.setattr(registry, "PROMPT_DIR", Path(tmp))
        versions = registry.list_versions("user_story")
        assert versions == ["v1", "v2"]


def test_list_versions_nonexistent(tmp_path, monkeypatch):
    """list_versions returns empty list for missing artifact type."""
    with tempfile.TemporaryDirectory() as tmp:
        monkeypatch.setattr(registry, "PROMPT_DIR", Path(tmp))
        assert registry.list_versions("nonexistent") == []


def test_load_prompt_latest(tmp_path, monkeypatch):
    """load_prompt with version='latest' loads the highest version."""
    with tempfile.TemporaryDirectory() as tmp:
        artifact_dir = Path(tmp) / "user_story"
        artifact_dir.mkdir()
        (artifact_dir / "v1.yaml").write_text(
            "system: You are a helper\nhuman: Write {{requirement}}\nversion_id: v1-id"
        )
        (artifact_dir / "v2.yaml").write_text(
            "system: You are a v2 helper\nhuman: Write {{requirement}} v2\nversion_id: v2-id"
        )

        monkeypatch.setattr(registry, "PROMPT_DIR", Path(tmp))
        prompt, version_id = registry.load_prompt("user_story", "latest")
        assert version_id == "v2-id"
        assert "v2 helper" in prompt.messages[0].prompt.template


def test_load_prompt_specific_version(tmp_path, monkeypatch):
    """load_prompt with a specific version loads that version."""
    with tempfile.TemporaryDirectory() as tmp:
        artifact_dir = Path(tmp) / "user_story"
        artifact_dir.mkdir()
        (artifact_dir / "v1.yaml").write_text(
            "system: System v1\nhuman: Human v1\nversion_id: v1-id"
        )

        monkeypatch.setattr(registry, "PROMPT_DIR", Path(tmp))
        prompt, version_id = registry.load_prompt("user_story", "v1")
        assert version_id == "v1-id"
        assert "System v1" in prompt.messages[0].prompt.template


def test_load_prompt_missing_type(tmp_path, monkeypatch):
    """load_prompt raises FileNotFoundError for missing artifact type."""
    with tempfile.TemporaryDirectory() as tmp:
        monkeypatch.setattr(registry, "PROMPT_DIR", Path(tmp))
        with pytest.raises(FileNotFoundError, match="No prompt templates found"):
            registry.load_prompt("nonexistent", "latest")


def test_load_prompt_missing_version(tmp_path, monkeypatch):
    """load_prompt raises FileNotFoundError for missing version file."""
    with tempfile.TemporaryDirectory() as tmp:
        artifact_dir = Path(tmp) / "user_story"
        artifact_dir.mkdir()
        (artifact_dir / "v1.yaml").write_text("system: x\nhuman: y")

        monkeypatch.setattr(registry, "PROMPT_DIR", Path(tmp))
        with pytest.raises(FileNotFoundError, match="Prompt version not found"):
            registry.load_prompt("user_story", "v99")
