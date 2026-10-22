import hashlib
import json
import logging
import time
from collections.abc import Iterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from starlette.responses import Response

from app.config import get_settings
from app.contracts import (
    DocumentResponse,
    EntityResponse,
    HealthResponse,
    JobResponse,
    RelationshipResponse,
    SearchRequest,
    SearchResponse,
    SearchResult,
)
from app.database import connection, database_is_ready, fetch_all

logger = logging.getLogger("sprintsmith.api")
HTTP_REQUESTS = Counter(
    "sprintsmith_http_requests_total",
    "Total HTTP requests handled by the API.",
    ["method", "path", "status"],
)
HTTP_LATENCY = Histogram(
    "sprintsmith_http_request_duration_seconds",
    "HTTP request duration in seconds.",
    ["method", "path"],
)


@asynccontextmanager
async def lifespan(_: FastAPI) -> Iterator[None]:
    settings = get_settings()
    logging.basicConfig(level=settings.log_level, format="%(message)s")
    logger.info(json.dumps({"event": "service_started", "environment": settings.environment}))
    yield
    logger.info(json.dumps({"event": "service_stopped"}))


app = FastAPI(title="SprintSmith API", version=get_settings().version, lifespan=lifespan)


@app.middleware("http")
async def request_logging(request: Request, call_next):
    request_id = request.headers.get("x-request-id", str(uuid4()))
    started = time.perf_counter()
    response = await call_next(request)
    duration_seconds = time.perf_counter() - started
    duration_ms = round(duration_seconds * 1_000, 2)
    HTTP_REQUESTS.labels(request.method, request.url.path, str(response.status_code)).inc()
    HTTP_LATENCY.labels(request.method, request.url.path).observe(duration_seconds)
    response.headers["x-request-id"] = request_id
    logger.info(
        json.dumps(
            {
                "event": "http_request",
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": duration_ms,
            }
        )
    )
    return response


@app.get("/metrics", include_in_schema=False)
async def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(status="ok", service=settings.app_name, version=settings.version)


@app.get("/ready", response_model=HealthResponse)
async def ready() -> HealthResponse:
    settings = get_settings()
    if not database_is_ready():
        raise HTTPException(status_code=503, detail="database is not ready")
    return HealthResponse(status="ready", service=settings.app_name, version=settings.version)


@app.post("/v1/search", response_model=SearchResponse)
async def search(request: SearchRequest) -> SearchResponse:
    rows = fetch_all(
        """
        SELECT chunks.document_id, chunks.id AS chunk_id, chunks.text,
               ts_rank_cd(search_vector, plainto_tsquery('english', %s)) AS score,
               filename || ':chunk-' || ordinal::text AS citation
        FROM chunks JOIN documents ON documents.id = chunks.document_id
        WHERE search_vector @@ plainto_tsquery('english', %s)
        ORDER BY score DESC, ordinal
        LIMIT %s
        """,
        (request.query, request.query, request.top_k),
    )
    return SearchResponse(
        query=request.query,
        mode="lexical-ready-hybrid",
        results=[
            SearchResult(
                document_id=str(row["document_id"]),
                chunk_id=str(row["chunk_id"]),
                text=row["text"],
                score=float(row["score"]),
                citation=row["citation"],
            )
            for row in rows
        ],
    )


DEFAULT_TENANT = UUID("00000000-0000-0000-0000-000000000001")


def _document(row: dict) -> DocumentResponse:
    return DocumentResponse(**row)


@app.post("/v1/tenants/{tenant_id}/documents", response_model=JobResponse, status_code=202)
async def upload_document(tenant_id: UUID, file: Annotated[UploadFile, File(...)]) -> JobResponse:
    if tenant_id != DEFAULT_TENANT:
        raise HTTPException(status_code=404, detail="tenant not found")
    settings = get_settings()
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="document is empty")
    checksum = hashlib.sha256(content).hexdigest()
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    storage_path = upload_dir / f"{checksum}-{Path(file.filename or 'document').name}"
    storage_path.write_bytes(content)
    document_id = uuid4()
    job_id = uuid4()
    with connection() as conn:
        existing = conn.execute(
            "SELECT id FROM documents WHERE tenant_id = %s AND checksum = %s",
            (tenant_id, checksum),
        ).fetchone()
        if existing:
            document_id = existing[0]
            existing_job = conn.execute(
                """
                SELECT id, status, attempts, error FROM ingestion_jobs
                WHERE document_id = %s ORDER BY created_at DESC LIMIT 1
                """,
                (document_id,),
            ).fetchone()
            if existing_job:
                return JobResponse(
                    id=existing_job[0],
                    document_id=document_id,
                    status=existing_job[1],
                    attempts=existing_job[2],
                    error=existing_job[3],
                )
        else:
            conn.execute(
                """
                INSERT INTO documents
                    (id, tenant_id, filename, content_type, storage_path, checksum)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    document_id,
                    tenant_id,
                    file.filename or "document",
                    file.content_type or "application/octet-stream",
                    str(storage_path),
                    checksum,
                ),
            )
        conn.execute(
            "INSERT INTO ingestion_jobs (id, tenant_id, document_id) VALUES (%s, %s, %s)",
            (job_id, tenant_id, document_id),
        )
    return JobResponse(id=job_id, document_id=document_id, status="queued", attempts=0)


@app.get("/v1/tenants/{tenant_id}/documents", response_model=list[DocumentResponse])
async def list_documents(tenant_id: UUID) -> list[DocumentResponse]:
    rows = fetch_all(
        """
        SELECT id, tenant_id, filename, content_type, status, checksum
        FROM documents WHERE tenant_id = %s ORDER BY created_at DESC
        """,
        (tenant_id,),
    )
    return [_document(row) for row in rows]


@app.get("/v1/tenants/{tenant_id}/documents/{document_id}", response_model=DocumentResponse)
async def get_document(tenant_id: UUID, document_id: UUID) -> DocumentResponse:
    rows = fetch_all(
        """
        SELECT id, tenant_id, filename, content_type, status, checksum
        FROM documents WHERE tenant_id = %s AND id = %s
        """,
        (tenant_id, document_id),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="document not found")
    return _document(rows[0])


@app.delete("/v1/tenants/{tenant_id}/documents/{document_id}", status_code=204)
async def delete_document(tenant_id: UUID, document_id: UUID) -> None:
    with connection() as conn:
        result = conn.execute(
            "DELETE FROM documents WHERE tenant_id = %s AND id = %s",
            (tenant_id, document_id),
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="document not found")


@app.get("/v1/tenants/{tenant_id}/jobs", response_model=list[JobResponse])
async def list_jobs(tenant_id: UUID) -> list[JobResponse]:
    rows = fetch_all(
        """
        SELECT id, document_id, status, attempts, error FROM ingestion_jobs
        WHERE tenant_id = %s ORDER BY created_at DESC
        """,
        (tenant_id,),
    )
    return [JobResponse(**row) for row in rows]


@app.get("/v1/tenants/{tenant_id}/jobs/{job_id}", response_model=JobResponse)
async def get_job(tenant_id: UUID, job_id: UUID) -> JobResponse:
    rows = fetch_all(
        """
        SELECT id, document_id, status, attempts, error FROM ingestion_jobs
        WHERE tenant_id = %s AND id = %s
        """,
        (tenant_id, job_id),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="job not found")
    return JobResponse(**rows[0])


@app.get("/v1/tenants/{tenant_id}/graph/entities", response_model=list[EntityResponse])
async def graph_entities(tenant_id: UUID) -> list[EntityResponse]:
    rows = fetch_all(
        """
        SELECT id, name, entity_type, properties FROM graph_entities
        WHERE tenant_id = %s ORDER BY name
        """,
        (tenant_id,),
    )
    return [EntityResponse(**row) for row in rows]


@app.get("/v1/tenants/{tenant_id}/graph/relationships", response_model=list[RelationshipResponse])
async def graph_relationships(tenant_id: UUID) -> list[RelationshipResponse]:
    rows = fetch_all(
        """
        SELECT r.id, subject.name AS subject, r.predicate, object_entity.name AS object,
               r.confidence, r.source_chunk_id
        FROM graph_relationships r
        JOIN graph_entities subject ON subject.id = r.subject_id
        JOIN graph_entities object_entity ON object_entity.id = r.object_id
        WHERE r.tenant_id = %s ORDER BY subject.name, object_entity.name
        """,
        (tenant_id,),
    )
    return [RelationshipResponse(**row) for row in rows]


def run() -> None:
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=False)