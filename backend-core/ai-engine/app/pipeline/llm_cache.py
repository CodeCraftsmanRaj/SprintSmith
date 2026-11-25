"""Prompt-hash keyed SQLite cache for structured LLM calls."""
from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import time
from pathlib import Path
from typing import Any


def cache_key(model: str, prompt_hash: str, messages: list[Any]) -> str:
    payload = {"model": model, "prompt_hash": prompt_hash, "messages": [
        {"role": type(m).__name__, "content": str(getattr(m, "content", ""))} for m in messages
    ]}
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def _db_path() -> Path:
    return Path(os.environ.get("SPRINTSMITH_LLM_CACHE_PATH", "/tmp/sprintsmith-llm-cache.sqlite3"))


def _connect() -> sqlite3.Connection:
    path = _db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=5)
    db.execute("CREATE TABLE IF NOT EXISTS llm_cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at REAL NOT NULL)")
    return db


def get(key: str) -> str | None:
    if os.environ.get("SPRINTSMITH_LLM_CACHE", "enabled").lower() == "disabled":
        return None
    with _connect() as db:
        row = db.execute("SELECT value, expires_at FROM llm_cache WHERE key=?", (key,)).fetchone()
        if not row:
            return None
        if row[1] <= time.time():
            db.execute("DELETE FROM llm_cache WHERE key=?", (key,))
            return None
        return str(row[0])


def put(key: str, value: str) -> None:
    if os.environ.get("SPRINTSMITH_LLM_CACHE", "enabled").lower() == "disabled":
        return
    try:
        ttl = max(1, int(os.environ.get("SPRINTSMITH_LLM_CACHE_TTL", "86400")))
    except ValueError:
        ttl = 86400
    with _connect() as db:
        db.execute("INSERT OR REPLACE INTO llm_cache(key,value,expires_at) VALUES(?,?,?)",
                   (key, value, time.time() + ttl))


def delete(key: str) -> None:
    with _connect() as db:
        db.execute("DELETE FROM llm_cache WHERE key=?", (key,))
