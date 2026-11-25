"""Guard against sending requirement content to external traces in production."""
from __future__ import annotations

import os


def enforce_production_tracing_guard() -> None:
    production = (os.environ.get("RTIA_ENV") or "development").strip().lower() == "production"
    if not production:
        return
    enabled = any((os.environ.get(name, "").strip().lower() in {"true", "1", "yes", "enabled"})
                  for name in ("LANGSMITH_TRACING", "LANGCHAIN_TRACING_V2"))
    if enabled:
        raise RuntimeError("External LLM tracing is prohibited when RTIA_ENV=production")
    os.environ["LANGSMITH_TRACING"] = "false"
    os.environ["LANGCHAIN_TRACING_V2"] = "false"
