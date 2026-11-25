"""Stable, serializable envelopes for failed orchestrated LLM nodes."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


class LLMNodeFailure(RuntimeError):
    def __init__(self, node_id: str, exc: BaseException, attempts: int):
        message = str(exc) or type(exc).__name__
        self.detail: dict[str, Any] = {
            "agent": node_id,
            "error_class": type(exc).__name__,
            "http_status": getattr(exc, "status_code", None) or getattr(exc, "code", None),
            "message": message[:500],
            "retries_attempted": max(0, attempts - 1),
            "occurred_at": datetime.now(timezone.utc).isoformat(),
        }
        super().__init__(f"Node {node_id} failed ({self.detail['error_class']})")
