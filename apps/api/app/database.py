from contextlib import contextmanager
from typing import Any

import psycopg

from app.config import get_settings


@contextmanager
def connection():
    with psycopg.connect(get_settings().database_url) as conn:
        yield conn


def database_is_ready() -> bool:
    try:
        with connection() as conn:
            conn.execute("SELECT 1")
        return True
    except psycopg.Error:
        return False


def fetch_all(query: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(query, params)
            columns = [column.name for column in cursor.description]
            return [dict(zip(columns, row, strict=True)) for row in cursor.fetchall()]