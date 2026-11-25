"""Optional Langfuse tracing for LangChain and LangGraph runs."""
from __future__ import annotations

import logging
import uuid

from app.config import settings

logger = logging.getLogger("sprintsmith.ai_engine.langfuse")


def build_langfuse_config(*, project_id: str, artifact_type: str,
                          request_id: str | None = None) -> dict | None:
    """Return LangChain callback config when Langfuse is configured, else None."""
    if not settings.LANGFUSE_ENABLED:
        return None
    if not settings.LANGFUSE_PUBLIC_KEY or not settings.LANGFUSE_SECRET_KEY:
        logger.warning("Langfuse is enabled but project keys are missing; tracing is disabled.")
        return None

    try:
        from langfuse.langchain import CallbackHandler

        handler = CallbackHandler()
    except Exception as exc:
        # Observability setup must never prevent generation from completing.
        logger.warning("Could not initialize Langfuse callback (%s); tracing is disabled.",
                       type(exc).__name__)
        return None

    trace_request_id = request_id or str(uuid.uuid4())
    return {
        "run_name": "SprintSmith SOP generation",
        "callbacks": [handler],
        "metadata": {
            "langfuse_session_id": project_id,
            "langfuse_tags": ["sprintsmith", f"artifact:{artifact_type}"],
            "request_id": trace_request_id,
            "project_id": project_id,
            "artifact_type": artifact_type,
        },
    }


def flush_langfuse() -> None:
    """Flush queued traces so local runs and short-lived processes show them promptly."""
    if not settings.LANGFUSE_ENABLED or not settings.LANGFUSE_PUBLIC_KEY or not settings.LANGFUSE_SECRET_KEY:
        return
    try:
        from langfuse import get_client

        get_client().flush()
    except Exception as exc:
        logger.warning("Could not flush Langfuse events (%s).", type(exc).__name__)
