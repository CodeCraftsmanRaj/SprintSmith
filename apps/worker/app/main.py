import logging
import os
import re
import time
from pathlib import Path
from uuid import uuid4

import psycopg
from docx import Document

DATABASE_URL = os.getenv(
    "SPRINTSMITH_DATABASE_URL",
    "postgresql://sprintsmith:sprintsmith@db:5432/sprintsmith",
)


def run() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    logging.info("SprintSmith worker started")
    while True:
        try:
            with psycopg.connect(DATABASE_URL) as connection:
                if not process_job(connection):
                    time.sleep(2)
        except psycopg.Error as error:
            logging.error("worker database error: %s", error)
            time.sleep(5)


def extract_text(path: Path) -> str:
    if path.suffix.lower() == ".docx":
        return "\n".join(
            paragraph.text for paragraph in Document(path).paragraphs if paragraph.text.strip()
        )
    return path.read_text(encoding="utf-8", errors="replace")


def chunk_text(text: str, size: int = 900) -> list[str]:
    words = text.split()
    return [" ".join(words[index : index + size]) for index in range(0, len(words), size)] or [""]


def process_job(connection: psycopg.Connection) -> bool:
    with connection.transaction():
        job = connection.execute(
            """
            UPDATE ingestion_jobs
            SET status = 'processing', attempts = attempts + 1, started_at = now()
            WHERE id = (
                SELECT id FROM ingestion_jobs WHERE status = 'queued'
                ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
            )
            RETURNING id, document_id
            """
        ).fetchone()
        if not job:
            return False
        job_id, document_id = job
        document = connection.execute(
            "SELECT tenant_id, storage_path FROM documents WHERE id = %s", (document_id,)
        ).fetchone()
        try:
            text = extract_text(Path(document[1]))
            chunks = chunk_text(text)
            connection.execute("DELETE FROM chunks WHERE document_id = %s", (document_id,))
            for ordinal, chunk in enumerate(chunks):
                chunk_id = uuid4()
                connection.execute(
                    """
                    INSERT INTO chunks (id, tenant_id, document_id, ordinal, text)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (chunk_id, document[0], document_id, ordinal, chunk),
                )
                entities = set(re.findall(r"\b[A-Z][A-Za-z0-9_-]{2,}\b", chunk))
                entity_ids = {}
                for name in entities:
                    entity_id = connection.execute(
                        """
                        INSERT INTO graph_entities (id, tenant_id, name)
                        VALUES (%s, %s, %s)
                        ON CONFLICT (tenant_id, name, entity_type)
                        DO UPDATE SET name = EXCLUDED.name
                        RETURNING id
                        """,
                        (uuid4(), document[0], name),
                    ).fetchone()[0]
                    entity_ids[name] = entity_id
                names = sorted(entity_ids)
                for subject, object_name in zip(names, names[1:], strict=False):
                    connection.execute(
                        """
                        INSERT INTO graph_relationships
                            (id, tenant_id, subject_id, predicate, object_id, source_chunk_id)
                        VALUES (%s, %s, %s, 'co_occurs_with', %s, %s)
                        ON CONFLICT DO NOTHING
                        """,
                        (
                            uuid4(),
                            document[0],
                            entity_ids[subject],
                            entity_ids[object_name],
                            chunk_id,
                        ),
                    )
            connection.execute(
                "UPDATE documents SET status = 'indexed', updated_at = now() WHERE id = %s",
                (document_id,),
            )
            connection.execute(
                "UPDATE ingestion_jobs SET status = 'completed', finished_at = now() WHERE id = %s",
                (job_id,),
            )
        except Exception as error:
            connection.execute(
                "UPDATE documents SET status = 'failed', updated_at = now() WHERE id = %s",
                (document_id,),
            )
            connection.execute(
                """
                UPDATE ingestion_jobs SET status = 'failed', error = %s, finished_at = now()
                WHERE id = %s
                """,
                (str(error)[:2_000], job_id),
            )
        return True


if __name__ == "__main__":
    run()